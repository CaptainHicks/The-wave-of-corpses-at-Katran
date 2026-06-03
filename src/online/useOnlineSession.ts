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
      autoConnect: false
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
              const failedAck = localizeFailedAck(ack);
              clearOnlineSession();
              setModel((current) => ({
                ...current,
                busy: false,
                view: undefined,
                error: failedAck.error
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
        error: localizeOnlineError(error.message)
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
        const failedAck = localizeFailedAck(ack);
        options.onFailure?.(failedAck);
        setModel((current) => ({
          ...current,
          busy: false,
          error: failedAck.error,
          view: options.clearViewOnFailure ? undefined : current.view
        }));
        return failedAck;
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
  const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL?.trim();
  if (typeof window !== "undefined" && configuredSocketUrl && !configuredSocketUrl.includes("{{")) {
    return configuredSocketUrl;
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
    error: localizeOnlineError(error instanceof Error ? error.message : "Online request failed.")
  };
}

function localizeFailedAck(ack: OnlineEventFailureAck): OnlineEventFailureAck {
  return { ...ack, error: localizeOnlineError(ack.error) };
}

export function localizeOnlineError(message: string): string {
  const normalized = message.trim();
  const exactMessages: Record<string, string> = {
    "This room is no longer accepting players.": "这个房间已经不能加入了。",
    "This room is already full.": "这个房间已经满员了。",
    "Factions can only be changed while the room is in the lobby.": "只有在房间大厅里才能更换阵营。",
    "Player seat not found in this room.": "没有在这个房间里找到你的玩家席位。",
    "Unknown faction.": "未知阵营。",
    "That faction has already been chosen by another player.": "这个阵营已经被其他玩家选择了。",
    "This room has already started.": "这个房间已经开始游戏了。",
    "Only the host can start the room.": "只有房主可以开始游戏。",
    "The room must be full before the host can start the game.": "房间满员后，房主才能开始游戏。",
    "Every player must choose a faction before the host can start the game.": "所有玩家都选择阵营后，房主才能开始游戏。",
    "This room is not in an active game.": "这个房间当前不在游戏中。",
    "Failed to allocate a unique room code.": "房间码生成失败，请稍后重试。",
    "Player name is required.": "请输入玩家名称。",
    "Room not found.": "没有找到这个房间。",
    "Online rooms support 2 to 6 players.": "在线房间支持 2 到 6 名玩家。",
    "This player cannot issue that command in online mode.": "这名玩家不能在联机模式中执行这个操作。",
    "Debug and local-only commands are disabled in online mode.": "调试和本地专用操作不能在联机模式中使用。",
    "Forced dice rolls are disabled in online mode.": "联机模式不能指定骰子点数。",
    "Viewer is not part of this room.": "你不在这个房间中。",
    "Only the active online player may submit this command.": "只有当前行动玩家可以执行这个操作。",
    "Timeout command no longer matches the active player.": "超时操作已经和当前行动玩家不一致。",
    "Saved session not found.": "没有找到可恢复的联机房间。",
    "Join or resume the room before starting it.": "请先加入或恢复房间，再开始游戏。",
    "Join or resume the room before choosing a faction.": "请先加入或恢复房间，再选择阵营。",
    "Join or resume the room before sending commands.": "请先加入或恢复房间，再进行操作。",
    "Join or resume the room before leaving it.": "请先加入或恢复房间，再离开房间。",
    "Online request failed.": "联机请求失败，请稍后重试。",
    "Unknown online server error.": "联机服务器发生未知错误。"
  };
  if (exactMessages[normalized]) return exactMessages[normalized];
  const timeoutMatch = /^Timed out waiting for (.+) acknowledgement\.$/.exec(normalized);
  if (timeoutMatch) return `联机请求超时，请检查网络后重试。`;
  if (/websocket|xhr poll|transport|socket/i.test(normalized)) {
    return "联机连接失败，请检查网络或稍后重试。";
  }
  return normalized || "联机请求失败，请稍后重试。";
}
