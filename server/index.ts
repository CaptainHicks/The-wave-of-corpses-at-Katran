import { existsSync, readdirSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import express from "express";
import { Server as SocketIoServer } from "socket.io";
import type {
  OnlineEventAck,
  RoomChatRequest,
  RoomChooseFactionRequest,
  RoomCommandRequest,
  RoomCreateRequest,
  RoomJoinRequest,
  RoomLeaveRequest,
  RoomResumeRequest,
  RoomReturnToLobbyRequest,
  RoomStartRequest
} from "../src/online/protocol";
import { buildLobbyView, buildOnlineGameViews } from "../src/online/protocol";
import { createCorsOriginMatcher, resolveAllowedCorsOrigins, resolveRoomStoreDriver } from "./config";
import { getCloudBaseRuntimeInfo } from "./rooms/cloudBaseRoomStore";
import { createRoomStore } from "./rooms/createRoomStore";
import { OnlineRoomError, OnlineRoomService } from "./rooms/onlineRoomService";
import type { StoredOnlineRoom } from "./rooms/types";

process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled rejection", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[server] Uncaught exception", error);
});

const PORT = Number(process.env.PORT ?? 3001);
const DIST_DIR = path.resolve(process.cwd(), "dist");
const DIST_ASSETS_DIR = path.join(DIST_DIR, "assets");
const PERSIST_ROOT = path.resolve(process.env.ROOMS_DATA_DIR ?? path.resolve(process.cwd(), "data"));
const AUDIO_DIR = path.join(PERSIST_ROOT, "audio");
const ROOM_STORE_DRIVER = resolveRoomStoreDriver();

const store = createRoomStore();
const roomService = new OnlineRoomService({ store });
const app = express();

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    roomStoreDriver: ROOM_STORE_DRIVER,
    allowedCorsOrigins: resolveAllowedCorsOrigins(),
    ...(ROOM_STORE_DRIVER === "cloudbase" ? { cloudbase: getCloudBaseRuntimeInfo() } : {})
  });
});

if (existsSync(DIST_DIR)) {
  if (existsSync(AUDIO_DIR)) {
    // Prefer audio files from the persistent data directory when they are available.
    app.use(
      "/assets/audio",
      express.static(AUDIO_DIR, {
        index: false,
        setHeaders: (response) => {
          response.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
        }
      })
    );
  }
  if (existsSync(DIST_ASSETS_DIR)) {
    const publicAssetDirectories = readdirSync(DIST_ASSETS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const directoryName of publicAssetDirectories) {
      app.use(
        `/assets/${directoryName}`,
        express.static(path.join(DIST_ASSETS_DIR, directoryName), {
          index: false,
          setHeaders: (response, filePath) => {
            response.setHeader(
              "Cache-Control",
              isVersionedAsset(filePath)
                ? "public, max-age=31536000, immutable"
                : "public, max-age=604800, stale-while-revalidate=86400"
            );
          }
        })
      );
    }

    app.use(
      "/assets",
      express.static(DIST_ASSETS_DIR, {
        index: false,
        setHeaders: (response) => {
          response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      })
    );
  }
  app.use(
    express.static(DIST_DIR, {
      index: false,
      setHeaders: (response, filePath) => {
        response.setHeader(
          "Cache-Control",
          filePath.endsWith(".html")
            ? "no-cache"
            : "public, max-age=86400, stale-while-revalidate=604800"
        );
      }
    })
  );
  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path === "/health" || request.path.startsWith("/socket.io")) {
      next();
      return;
    }
    response.setHeader("Cache-Control", "no-cache");
    response.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

const server = http.createServer(app);
const io = new SocketIoServer(server, {
  cors: {
    origin: createCorsOriginMatcher(),
    credentials: true
  }
});

const socketSessions = new Map<string, { roomCode: string; playerId: string }>();
const socketsByPlayerKey = new Map<string, Set<string>>();

io.on("connection", (socket) => {
  socket.on("room:create", async (payload: RoomCreateRequest, ack?: (result: OnlineEventAck) => void) => {
    try {
      const created = await roomService.createRoom(payload);
      attachSocket(socket.id, created.room.roomCode, created.seat.playerId);
      socket.join(created.room.roomCode);
      await emitRoomViews(created.room);
      ack?.({
        ok: true,
        roomCode: created.room.roomCode,
        viewerPlayerId: created.seat.playerId,
        sessionToken: created.seat.sessionToken
      });
    } catch (error) {
      ack?.(toAckError(error));
    }
  });

  socket.on("room:join", async (payload: RoomJoinRequest, ack?: (result: OnlineEventAck) => void) => {
    try {
      const joined = await roomService.joinRoom(payload);
      attachSocket(socket.id, joined.room.roomCode, joined.seat.playerId);
      socket.join(joined.room.roomCode);
      await emitRoomViews(joined.room);
      ack?.({
        ok: true,
        roomCode: joined.room.roomCode,
        viewerPlayerId: joined.seat.playerId,
        sessionToken: joined.seat.sessionToken
      });
    } catch (error) {
      ack?.(toAckError(error));
    }
  });

  socket.on("room:resume", async (payload: RoomResumeRequest, ack?: (result: OnlineEventAck) => void) => {
    try {
      const resumed = await roomService.resumeSession(payload);
      if (!resumed) {
        throw new OnlineRoomError("没有找到可恢复的联机房间。");
      }
      attachSocket(socket.id, resumed.room.roomCode, resumed.seat.playerId);
      socket.join(resumed.room.roomCode);
      await emitRoomViews(resumed.room);
      ack?.({
        ok: true,
        roomCode: resumed.room.roomCode,
        viewerPlayerId: resumed.seat.playerId,
        sessionToken: resumed.seat.sessionToken
      });
    } catch (error) {
      ack?.(toAckError(error));
    }
  });

  socket.on("room:start", async (payload: RoomStartRequest, ack?: (result: OnlineEventAck) => void) => {
    try {
      const session = socketSessions.get(socket.id);
      if (!session || session.roomCode !== payload.roomCode) {
        throw new OnlineRoomError("请先加入或恢复房间，再开始游戏。");
      }
      const room = await roomService.startRoom({
        roomCode: payload.roomCode,
        viewerPlayerId: session.playerId
      });
      await emitRoomViews(room);
      ack?.({
        ok: true,
        roomCode: room.roomCode,
        viewerPlayerId: session.playerId
      });
    } catch (error) {
      ack?.(toAckError(error));
    }
  });

  socket.on("room:chooseFaction", async (payload: RoomChooseFactionRequest, ack?: (result: OnlineEventAck) => void) => {
    try {
      const session = socketSessions.get(socket.id);
      if (!session || session.roomCode !== payload.roomCode) {
        throw new OnlineRoomError("请先加入或恢复房间，再选择阵营。");
      }
      const room = await roomService.chooseFaction({
        roomCode: payload.roomCode,
        playerId: session.playerId,
        factionId: payload.factionId
      });
      await emitRoomViews(room);
      ack?.({
        ok: true,
        roomCode: room.roomCode,
        viewerPlayerId: session.playerId
      });
    } catch (error) {
      ack?.(toAckError(error));
    }
  });

  socket.on("room:command", async (payload: RoomCommandRequest, ack?: (result: OnlineEventAck) => void) => {
    try {
      const session = socketSessions.get(socket.id);
      if (!session || session.roomCode !== payload.roomCode) {
        throw new OnlineRoomError("请先加入或恢复房间，再进行操作。");
      }
      const room = await roomService.applyPlayerCommand({
        roomCode: payload.roomCode,
        viewerPlayerId: session.playerId,
        command: payload.command
      });
      await emitRoomViews(room);
      ack?.({
        ok: true,
        roomCode: room.roomCode,
        viewerPlayerId: session.playerId
      });
    } catch (error) {
      ack?.(toAckError(error));
    }
  });

  socket.on("room:chat", async (payload: RoomChatRequest, ack?: (result: OnlineEventAck) => void) => {
    try {
      const session = socketSessions.get(socket.id);
      if (!session || session.roomCode !== payload.roomCode) {
        throw new OnlineRoomError("请先加入或恢复房间，再发送聊天消息。");
      }
      const room = await roomService.sendChatMessage({
        roomCode: payload.roomCode,
        viewerPlayerId: session.playerId,
        text: payload.text
      });
      await emitRoomViews(room);
      ack?.({
        ok: true,
        roomCode: room.roomCode,
        viewerPlayerId: session.playerId
      });
    } catch (error) {
      ack?.(toAckError(error));
    }
  });

  socket.on("room:returnToLobby", async (payload: RoomReturnToLobbyRequest, ack?: (result: OnlineEventAck) => void) => {
    try {
      const session = socketSessions.get(socket.id);
      if (!session || session.roomCode !== payload.roomCode) {
        throw new OnlineRoomError("请先加入或恢复房间，再返回大厅。");
      }
      const room = await roomService.returnToLobby({
        roomCode: payload.roomCode,
        viewerPlayerId: session.playerId
      });
      await emitRoomViews(room);
      ack?.({
        ok: true,
        roomCode: room.roomCode,
        viewerPlayerId: session.playerId
      });
    } catch (error) {
      ack?.(toAckError(error));
    }
  });

  socket.on("room:leave", async (payload: RoomLeaveRequest, ack?: (result: OnlineEventAck) => void) => {
    try {
      const session = socketSessions.get(socket.id);
      if (!session || session.roomCode !== payload.roomCode) {
        throw new OnlineRoomError("请先加入或恢复房间，再离开房间。");
      }
      const room = await roomService.leaveRoom({
        roomCode: payload.roomCode,
        playerId: session.playerId
      });
      detachPlayerSockets(payload.roomCode, session.playerId);
      socket.leave(payload.roomCode);
      if (room) {
        await emitRoomViews(room);
      }
      ack?.({
        ok: true,
        roomCode: payload.roomCode,
        viewerPlayerId: session.playerId
      });
    } catch (error) {
      ack?.(toAckError(error));
    }
  });

  socket.on("disconnect", async () => {
    const session = socketSessions.get(socket.id);
    detachSocket(socket.id);
    if (!session) return;
    const key = playerKey(session.roomCode, session.playerId);
    if ((socketsByPlayerKey.get(key)?.size ?? 0) > 0) return;
    const room = await roomService.markDisconnected({
      roomCode: session.roomCode,
      playerId: session.playerId
    });
    if (room) {
      await emitRoomViews(room);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Zombie Catan online server listening on http://0.0.0.0:${PORT}`);
});

async function emitRoomViews(room: StoredOnlineRoom) {
  const connectedPlayerIds = room.seats.filter((seat) => seat.connected).map((seat) => seat.playerId);
  if (room.status === "lobby") {
    const lobbyMeta = {
      roomCode: room.roomCode,
      hostPlayerId: room.hostPlayerId,
      status: room.status,
      connectedPlayerIds,
      targetPlayerCount: room.targetPlayerCount,
      fogEnabled: room.fogEnabled
    } as const;

    for (const seat of room.seats) {
      emitToPlayer(
        room.roomCode,
        seat.playerId,
        "room:view",
        buildLobbyView(lobbyMeta, room.seats, seat.playerId, room.chatMessages ?? [])
      );
    }
    return;
  }

  if (!room.gameState) return;
  const roomMeta = {
    roomCode: room.roomCode,
    hostPlayerId: room.hostPlayerId,
    status: room.status,
    connectedPlayerIds
  } as const;

  const views = buildOnlineGameViews(roomMeta, room.gameState, room.seats.map((seat) => seat.playerId), room.lastCommand);
  for (const view of views) {
    emitToPlayer(room.roomCode, view.viewerPlayerId, "room:view", view);
  }
}

function emitToPlayer(roomCode: string, playerId: string, eventName: "room:view", payload: unknown) {
  const sockets = socketsByPlayerKey.get(playerKey(roomCode, playerId));
  if (!sockets) return;
  for (const socketId of sockets) {
    io.to(socketId).emit(eventName, payload);
  }
}

function attachSocket(socketId: string, roomCode: string, playerId: string) {
  detachSocket(socketId);
  socketSessions.set(socketId, { roomCode, playerId });
  const key = playerKey(roomCode, playerId);
  const sockets = socketsByPlayerKey.get(key) ?? new Set<string>();
  sockets.add(socketId);
  socketsByPlayerKey.set(key, sockets);
}

function detachSocket(socketId: string) {
  const session = socketSessions.get(socketId);
  if (!session) return;
  socketSessions.delete(socketId);
  const key = playerKey(session.roomCode, session.playerId);
  const sockets = socketsByPlayerKey.get(key);
  if (!sockets) return;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    socketsByPlayerKey.delete(key);
  }
}

function detachPlayerSockets(roomCode: string, playerId: string) {
  const key = playerKey(roomCode, playerId);
  const sockets = socketsByPlayerKey.get(key);
  if (!sockets) return;
  for (const socketId of sockets) {
    socketSessions.delete(socketId);
    io.sockets.sockets.get(socketId)?.leave(roomCode);
  }
  socketsByPlayerKey.delete(key);
}

function playerKey(roomCode: string, playerId: string) {
  return `${roomCode}:${playerId}`;
}

function isVersionedAsset(filePath: string) {
  const fileName = path.basename(filePath);
  return /\.[vV]\d+\./.test(fileName) || /-[A-Za-z0-9_-]{6,}\./.test(fileName);
}

function toAckError(error: unknown): OnlineEventAck {
  if (error instanceof OnlineRoomError) {
    return { ok: false, error: error.message };
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "联机服务器发生未知错误。" };
}
