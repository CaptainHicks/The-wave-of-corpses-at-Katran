import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  OnlineEventAck,
  RoomCommandRequest,
  RoomCreateRequest,
  RoomJoinRequest,
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
      transports: ["websocket", "polling"]
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
        void emitWithAck(socket, "room:resume", savedSession).then((ack) => {
          if (!ack.ok) {
            clearOnlineSession();
            setModel((current) => ({
              ...current,
              busy: false,
              view: undefined,
              error: ack.error
            }));
          }
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

  const createRoom = useCallback(async (payload: RoomCreateRequest) => {
    setModel((current) => ({ ...current, busy: true, error: undefined }));
    const socket = await connectSocket();
    const ack = await emitWithAck(socket, "room:create", payload);
    if (!ack.ok) {
      setModel((current) => ({ ...current, busy: false, error: ack.error }));
      return ack;
    }
    if (ack.sessionToken) {
      saveOnlineSession({ roomCode: ack.roomCode, sessionToken: ack.sessionToken });
    }
    setModel((current) => ({ ...current, busy: false, error: undefined }));
    return ack;
  }, [connectSocket]);

  const joinRoom = useCallback(async (payload: RoomJoinRequest) => {
    setModel((current) => ({ ...current, busy: true, error: undefined }));
    const socket = await connectSocket();
    const ack = await emitWithAck(socket, "room:join", payload);
    if (!ack.ok) {
      setModel((current) => ({ ...current, busy: false, error: ack.error }));
      return ack;
    }
    if (ack.sessionToken) {
      saveOnlineSession({ roomCode: ack.roomCode, sessionToken: ack.sessionToken });
    }
    setModel((current) => ({ ...current, busy: false, error: undefined }));
    return ack;
  }, [connectSocket]);

  const startRoom = useCallback(async (payload: RoomStartRequest) => {
    setModel((current) => ({ ...current, busy: true, error: undefined }));
    const socket = await connectSocket();
    const ack = await emitWithAck(socket, "room:start", payload);
    if (!ack.ok) {
      setModel((current) => ({ ...current, busy: false, error: ack.error }));
      return ack;
    }
    setModel((current) => ({ ...current, busy: false, error: undefined }));
    return ack;
  }, [connectSocket]);

  const sendCommand = useCallback(async (payload: RoomCommandRequest) => {
    setModel((current) => ({ ...current, busy: true, error: undefined }));
    const socket = await connectSocket();
    const ack = await emitWithAck(socket, "room:command", payload);
    if (!ack.ok) {
      setModel((current) => ({ ...current, busy: false, error: ack.error }));
      return ack;
    }
    setModel((current) => ({ ...current, busy: false, error: undefined }));
    return ack;
  }, [connectSocket]);

  const resumeSavedSession = useCallback(async () => {
    const savedSession = loadSavedOnlineSession();
    if (!savedSession) return undefined;
    setModel((current) => ({ ...current, busy: true, error: undefined }));
    const socket = await connectSocket();
    const ack = await emitWithAck(socket, "room:resume", savedSession as RoomResumeRequest);
    if (!ack.ok) {
      clearOnlineSession();
      setModel((current) => ({ ...current, busy: false, error: ack.error, view: undefined }));
      return ack;
    }
    if (ack.sessionToken) {
      saveOnlineSession({ roomCode: ack.roomCode, sessionToken: ack.sessionToken });
    }
    setModel((current) => ({ ...current, busy: false, error: undefined }));
    return ack;
  }, [connectSocket]);

  const leaveRoom = useCallback(() => {
    clearOnlineSession();
    lastResumedSocketIdRef.current = undefined;
    socketRef.current?.disconnect();
    socketRef.current = undefined;
    setModel({
      busy: false,
      connectionState: "disconnected",
      view: undefined
    });
  }, []);

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

async function emitWithAck(
  socket: Socket,
  eventName: "room:create" | "room:join" | "room:resume" | "room:start" | "room:command",
  payload: unknown
) {
  return await new Promise<OnlineEventAck>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`Timed out waiting for ${eventName} acknowledgement.`));
    }, 10_000);

    socket.emit(eventName, payload, (ack: OnlineEventAck) => {
      window.clearTimeout(timeoutId);
      resolve(ack);
    });
  });
}
