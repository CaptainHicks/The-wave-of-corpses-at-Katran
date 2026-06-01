import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  OnlineEventAck,
  RoomChooseFactionRequest,
  RoomCommandRequest,
  RoomCreateRequest,
  RoomJoinRequest,
  RoomLeaveRequest,
  RoomResumeRequest,
  RoomStartRequest,
  RoomView
} from "./protocol";
import { clearOnlineSession, loadSavedOnlineSession, saveOnlineSession } from "./sessionStorage";

export type OnlineConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

interface OnlineSessionModel {
  busy: boolean;
  connectionState: OnlineConnectionState;
  error?: string;
  view?: RoomView;
}

type OnlineEventName =
  | "room:create"
  | "room:join"
  | "room:resume"
  | "room:start"
  | "room:chooseFaction"
  | "room:leave"
  | "room:command";
type OnlineEventSuccessAck = Extract<OnlineEventAck, { ok: true }>;
type OnlineEventFailureAck = Extract<OnlineEventAck, { ok: false }>;

export function useOnlineSession() {
  const [model, setModel] = useState<OnlineSessionModel>({
    busy: false,
    connectionState: "disconnected"
  });
  const socketRef = useRef<Socket>();
  const lastResumedSocketIdRef = useRef<string>();

  const ensureSocket = useCallback(() => {
    if (socketRef.current) return socketRef.current;

    const socket = io(resolveSocketUrl(), {
      autoConnect: false,
      transports: ["websocket"]
    });

    socket.on("room:view", (view: RoomView) => {
      setModel((current) => ({
        ...current,
        busy: false,
        error: undefined,
        view,
        connectionState: "connected"
      }));
    });

    socket.on("connect", () => {
      setModel((current) => ({
        ...current,
        connectionState: "connected"
      }));
      const savedSession = loadSavedOnlineSession();
      if (savedSession && socket.id && lastResumedSocketIdRef.current !== socket.id) {
        lastResumedSocketIdRef.current = socket.id;
        void emitWithAck<OnlineEventAck>(socket, "room:resume", savedSession)
          .then((ack) => {
            if (!ack.ok) {
              clearOnlineSession();
              setModel((current) => ({
                ...current,
                busy: false,
                view: undefined,
                error: ack.error
              }));
            }
          })
          .catch((error) => {
            const ack = toFailedAck(error);
            clearOnlineSession();
            setModel((current) => ({
              ...current,
              busy: false,
              view: undefined,
              error: ack.error
            }));
          });
      }
    });

    socket.on("disconnect", () => {
      setModel((current) => ({
        ...current,
        connectionState: current.view ? "reconnecting" : "disconnected"
      }));
    });

    socket.on("connect_error", (error) => {
      setModel((current) => ({
        ...current,
        busy: false,
        connectionState: "disconnected",
        error: error.message
      }));
    });

    socketRef.current = socket;
    return socket;
  }, []);

  const connectSocket = useCallback(async () => {
    const socket = ensureSocket();
    if (socket.connected) return socket;

    setModel((current) => ({
      ...current,
      connectionState: current.view ? "reconnecting" : "connecting"
    }));
    socket.connect();

    await new Promise<void>((resolve, reject) => {
      const handleConnect = () => {
        cleanup();
        resolve();
      };
      const handleError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        socket.off("connect", handleConnect);
        socket.off("connect_error", handleError);
      };

      socket.on("connect", handleConnect);
      socket.on("connect_error", handleError);
    });

    return socket;
  }, [ensureSocket]);

  const runOnlineAck = useCallback(async (
    eventName: OnlineEventName,
    payload: unknown,
    options: {
      onSuccess?: (ack: OnlineEventSuccessAck) => void;
      onFailure?: (ack: OnlineEventFailureAck) => void;
      clearViewOnFailure?: boolean;
    } = {}
  ) => {
    setModel((current) => ({ ...current, busy: true, error: undefined }));
    try {
      const socket = await connectSocket();
      const ack = await emitWithAck<OnlineEventAck>(socket, eventName, payload);
      if (!ack.ok) {
        options.onFailure?.(ack);
        setModel((current) => ({
          ...current,
          busy: false,
          error: ack.error,
          view: options.clearViewOnFailure ? undefined : current.view
        }));
        return ack;
      }
      options.onSuccess?.(ack);
      setModel((current) => ({ ...current, busy: false, error: undefined }));
      return ack;
    } catch (error) {
      const ack = toFailedAck(error);
      options.onFailure?.(ack);
      setModel((current) => ({
        ...current,
        busy: false,
        error: ack.error,
        view: options.clearViewOnFailure ? undefined : current.view
      }));
      return ack;
    }
  }, [connectSocket]);

  const createRoom = useCallback(async (payload: RoomCreateRequest) => {
    return runOnlineAck("room:create", payload, {
      onSuccess: (ack) => {
        if (ack.sessionToken) {
          saveOnlineSession({ roomCode: ack.roomCode, sessionToken: ack.sessionToken });
        }
      }
    });
  }, [runOnlineAck]);

  const joinRoom = useCallback(async (payload: RoomJoinRequest) => {
    return runOnlineAck("room:join", payload, {
      onSuccess: (ack) => {
        if (ack.sessionToken) {
          saveOnlineSession({ roomCode: ack.roomCode, sessionToken: ack.sessionToken });
        }
      }
    });
  }, [runOnlineAck]);

  const startRoom = useCallback(async (payload: RoomStartRequest) => {
    return runOnlineAck("room:start", payload);
  }, [runOnlineAck]);

  const chooseFaction = useCallback(async (payload: RoomChooseFactionRequest) => {
    return runOnlineAck("room:chooseFaction", payload);
  }, [runOnlineAck]);

  const sendCommand = useCallback(async (payload: RoomCommandRequest) => {
    return runOnlineAck("room:command", payload);
  }, [runOnlineAck]);

  const resumeSavedSession = useCallback(async () => {
    const savedSession = loadSavedOnlineSession();
    if (!savedSession) return undefined;
    return runOnlineAck("room:resume", savedSession as RoomResumeRequest, {
      clearViewOnFailure: true,
      onFailure: () => clearOnlineSession(),
      onSuccess: (ack) => {
        if (ack.sessionToken) {
          saveOnlineSession({ roomCode: ack.roomCode, sessionToken: ack.sessionToken });
        }
      }
    });
  }, [runOnlineAck]);

  const leaveRoom = useCallback(() => {
    const currentView = model.view;
    const socket = socketRef.current;
    clearOnlineSession();
    lastResumedSocketIdRef.current = undefined;
    if (currentView && socket?.connected) {
      const payload: RoomLeaveRequest = { roomCode: currentView.roomMeta.roomCode };
      if (socketRef.current === socket) {
        socketRef.current = undefined;
      }
      void emitWithAck<OnlineEventAck>(socket, "room:leave", payload)
        .catch(() => undefined)
        .finally(() => {
          socket.disconnect();
        });
    } else {
      socket?.disconnect();
      socketRef.current = undefined;
    }
    setModel({
      busy: false,
      connectionState: "disconnected",
      view: undefined
    });
  }, [model.view]);

  useEffect(() => {
    if (loadSavedOnlineSession()) {
      void connectSocket();
    }
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = undefined;
    };
  }, [connectSocket]);

  const lobbyView = useMemo(
    () => (model.view?.kind === "lobby" ? model.view : undefined),
    [model.view]
  );
  const gameView = useMemo(
    () => (model.view?.kind === "game" ? model.view : undefined),
    [model.view]
  );

  return {
    ...model,
    lobbyView,
    gameView,
    createRoom,
    joinRoom,
    chooseFaction,
    startRoom,
    sendCommand,
    leaveRoom,
    dismissError: () => setModel((current) => ({ ...current, error: undefined })),
    resumeSavedSession
  };
}

function resolveSocketUrl() {
  if (typeof window !== "undefined" && import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL;
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://127.0.0.1:3001";
}

async function emitWithAck<TAck>(
  socket: Socket,
  eventName: OnlineEventName,
  payload: unknown
) {
  return await new Promise<TAck>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Timed out waiting for ${eventName} acknowledgement.`));
    }, 10_000);

    socket.emit(eventName, payload, (ack: TAck) => {
      window.clearTimeout(timeoutId);
      resolve(ack);
    });
  });
}

function toFailedAck(error: unknown): OnlineEventFailureAck {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Online request failed."
  };
}
