// @vitest-environment node

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileRoomStore } from "../../../server/rooms/fileRoomStore.ts";
import { OnlineRoomError, OnlineRoomService } from "../../../server/rooms/onlineRoomService.ts";
import { createResources } from "../../domain/constants";
import { applyCommand, legalBuildEdges, legalInitialCampVertices, legalInitialRouteEdges } from "../../domain/rules";
import type { GameState } from "../../domain/types";
import type { RoomStoreTransaction } from "../../../server/rooms/roomStore.ts";

const tempDirs: string[] = [];

async function createService() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "zombie-catan-online-room-service-"));
  tempDirs.push(rootDir);
  const store = new FileRoomStore({ rootDir, now: () => 10_000 });
  return new OnlineRoomService({ store, now: () => 10_000 });
}

async function createTransactionalService() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "zombie-catan-online-room-service-tx-"));
  tempDirs.push(rootDir);
  const store = new TransactionCountingFileStore({ rootDir, now: () => 10_000 });
  return { service: new OnlineRoomService({ store, now: () => 10_000 }), store };
}

async function createServiceWithStore() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "zombie-catan-online-room-service-store-"));
  tempDirs.push(rootDir);
  const store = new FileRoomStore({ rootDir, now: () => 10_000 });
  return { service: new OnlineRoomService({ store, now: () => 10_000 }), store };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0, tempDirs.length).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe("OnlineRoomService", () => {
  it("creates AI seats and runs their setup turns on the server before returning control to the host", async () => {
    const service = await createService();
    const host = await service.createRoom({
      name: "Host",
      targetPlayerCount: 2,
      aiPlayerCount: 1,
      fogEnabled: false
    });

    expect(host.room.seats).toHaveLength(2);
    expect(host.room.seats[1]).toMatchObject({
      controller: "ai",
      connected: false,
      factionId: "blue-steel"
    });

    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: host.seat.playerId,
      factionId: "red-rust"
    });
    let room = await service.startRoom({
      roomCode: host.room.roomCode,
      viewerPlayerId: host.seat.playerId
    });

    for (let step = 0; room.gameState?.phase === "setup" && step < 10; step += 1) {
      expect(room.gameState.pending?.playerId ?? room.gameState.currentPlayerId).toBe(host.seat.playerId);
      const command =
        room.gameState.pending?.kind === "setupRoute"
          ? { type: "placeInitialRoute" as const, edgeId: legalInitialRouteEdges(room.gameState)[0] }
          : { type: "placeInitialCamp" as const, vertexId: legalInitialCampVertices(room.gameState)[0] };
      room = await service.applyPlayerCommand({
        roomCode: room.roomCode,
        viewerPlayerId: host.seat.playerId,
        command
      });
    }

    expect(room.gameState?.phase).not.toBe("setup");
    expect(room.gameState?.currentPlayerId).toBe(host.seat.playerId);
    expect(Object.values(room.gameState!.board.vertices).filter((vertex) => vertex.building?.ownerId === "p2")).toHaveLength(2);
    expect(Object.values(room.gameState!.board.edges).filter((edge) => edge.route?.ownerId === "p2")).toHaveLength(2);
  });

  it("creates a lobby, lets a second player join, and starts the game after everyone chooses a faction", async () => {
    const service = await createService();
    const host = await service.createRoom({
      name: "Host",
      targetPlayerCount: 2,
      fogEnabled: true
    });
    const guest = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Guest"
    });

    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: host.seat.playerId,
      factionId: "red-rust"
    });
    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: guest.seat.playerId,
      factionId: "blue-steel"
    });

    const started = await service.startRoom({
      roomCode: host.room.roomCode,
      viewerPlayerId: host.seat.playerId
    });

    expect(host.seat.playerId).toBe("p1");
    expect(guest.seat.playerId).toBe("p2");
    expect(started.status).toBe("active");
    expect(started.gameState?.players.map((player) => player.id)).toEqual(["p1", "p2"]);
    expect(started.gameState?.players.map((player) => player.factionId)).toEqual(["red-rust", "blue-steel"]);
    expect(started.gameState?.phase).toBe("setup");
  });

  it("refuses to start until the lobby is full and all players have chosen factions", async () => {
    const service = await createService();
    const host = await service.createRoom({
      name: "Host",
      targetPlayerCount: 2,
      fogEnabled: false
    });

    await expect(
      service.startRoom({ roomCode: host.room.roomCode, viewerPlayerId: host.seat.playerId })
    ).rejects.toThrow(OnlineRoomError);

    await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Guest"
    });

    await expect(
      service.startRoom({ roomCode: host.room.roomCode, viewerPlayerId: host.seat.playerId })
    ).rejects.toThrow("所有玩家都选择阵营后，房主才能开始游戏。");
  });

  it("returns localized errors for lobby failures", async () => {
    const service = await createService();
    await expect(service.joinRoom({ roomCode: "MISSING", name: "Guest" })).rejects.toThrow("没有找到这个房间。");
    await expect(service.createRoom({ name: "", targetPlayerCount: 2, fogEnabled: false })).rejects.toThrow(
      "请输入玩家名称。"
    );
    await expect(service.createRoom({ name: "Host", targetPlayerCount: 7, fogEnabled: false })).rejects.toThrow(
      "在线房间支持 2 到 6 名玩家。"
    );
  });

  it("prevents choosing a faction already claimed by another player but allows changing to an open one", async () => {
    const service = await createService();
    const host = await service.createRoom({
      name: "Host",
      targetPlayerCount: 2,
      fogEnabled: false
    });
    const guest = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Guest"
    });

    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: host.seat.playerId,
      factionId: "red-rust"
    });

    await expect(
      service.chooseFaction({
        roomCode: host.room.roomCode,
        playerId: guest.seat.playerId,
        factionId: "red-rust"
      })
    ).rejects.toThrow(OnlineRoomError);

    const updatedRoom = await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: guest.seat.playerId,
      factionId: "blue-steel"
    });

    expect(updatedRoom.seats.find((seat) => seat.playerId === guest.seat.playerId)?.factionId).toBe("blue-steel");
  });

  it("serializes concurrent lobby joins so no accepted player is lost", async () => {
    const service = await createService();
    const host = await service.createRoom({
      name: "Host",
      targetPlayerCount: 3,
      fogEnabled: true
    });

    const [guestA, guestB] = await Promise.all([
      service.joinRoom({ roomCode: host.room.roomCode, name: "GuestA" }),
      service.joinRoom({ roomCode: host.room.roomCode, name: "GuestB" })
    ]);
    const room = await service.getRoom(host.room.roomCode);

    const seatNames = room?.seats.map((seat) => seat.name) ?? [];
    expect(seatNames[0]).toBe("Host");
    expect(seatNames.slice(1).sort()).toEqual(["GuestA", "GuestB"]);
    expect(new Set([guestA.seat.playerId, guestB.seat.playerId]).size).toBe(2);
    expect(room?.seats.map((seat) => seat.playerId)).toEqual(["p1", "p2", "p3"]);
  });

  it("stores lobby chat messages and rejects blank chat", async () => {
    const service = await createService();
    const host = await service.createRoom({
      name: "Host",
      targetPlayerCount: 2,
      fogEnabled: true
    });
    const guest = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Guest"
    });

    const room = await service.sendChatMessage({
      roomCode: host.room.roomCode,
      viewerPlayerId: guest.seat.playerId,
      text: "  大家准备一下\n马上开始  "
    });

    expect(room.chatMessages?.at(-1)).toMatchObject({
      kind: "player",
      playerId: guest.seat.playerId,
      playerName: "Guest",
      text: "大家准备一下 马上开始"
    });
    await expect(
      service.sendChatMessage({
        roomCode: host.room.roomCode,
        viewerPlayerId: guest.seat.playerId,
        text: "   "
      })
    ).rejects.toThrow("请输入聊天内容。");
  });

  it("uses a store transaction for lobby mutations when the store supports it", async () => {
    const { service, store } = await createTransactionalService();
    const host = await service.createRoom({
      name: "Host",
      targetPlayerCount: 2,
      fogEnabled: true
    });

    await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Guest"
    });

    expect(store.transactionCount).toBe(1);
  });

  it("releases lobby seats when a player explicitly leaves", async () => {
    const service = await createService();
    const host = await service.createRoom({
      name: "Host",
      targetPlayerCount: 2,
      fogEnabled: true
    });
    const guest = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Guest"
    });

    const afterLeave = await service.leaveRoom({
      roomCode: host.room.roomCode,
      playerId: guest.seat.playerId
    });
    const replacement = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Replacement"
    });
    const room = await service.getRoom(host.room.roomCode);

    expect(afterLeave?.seats.map((seat) => seat.name)).toEqual(["Host"]);
    expect(replacement.seat.playerId).toBe("p2");
    expect(room?.seats.map((seat) => seat.name)).toEqual(["Host", "Replacement"]);
  });

  it("lets a disconnected lobby player rejoin a full room by name", async () => {
    const service = await createService();
    const host = await service.createRoom({
      name: "Host",
      targetPlayerCount: 2,
      fogEnabled: true
    });
    const guest = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Guest"
    });
    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: guest.seat.playerId,
      factionId: "blue-steel"
    });

    await service.markDisconnected({
      roomCode: host.room.roomCode,
      playerId: guest.seat.playerId
    });
    const rejoined = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: " Guest "
    });

    expect(rejoined.seat.playerId).toBe(guest.seat.playerId);
    expect(rejoined.seat.factionId).toBe("blue-steel");
    expect(rejoined.seat.connected).toBe(true);
    expect(rejoined.seat.sessionToken).not.toBe(guest.seat.sessionToken);
    expect(rejoined.room.seats.map((seat) => seat.name)).toEqual(["Host", "Guest"]);
  });

  it("lets a disconnected active-game player rejoin their original seat by name", async () => {
    const service = await createService();
    const host = await service.createRoom({
      name: "Host",
      targetPlayerCount: 2,
      fogEnabled: false
    });
    const guest = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Guest"
    });
    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: host.seat.playerId,
      factionId: "red-rust"
    });
    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: guest.seat.playerId,
      factionId: "blue-steel"
    });
    await service.startRoom({
      roomCode: host.room.roomCode,
      viewerPlayerId: host.seat.playerId
    });

    await service.markDisconnected({
      roomCode: host.room.roomCode,
      playerId: guest.seat.playerId
    });
    const rejoined = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "guest"
    });

    expect(rejoined.room.status).toBe("active");
    expect(rejoined.seat.playerId).toBe(guest.seat.playerId);
    expect(rejoined.seat.connected).toBe(true);
    expect(rejoined.room.gameState?.players.map((player) => player.id)).toEqual(["p1", "p2"]);
  });

  it("still refuses new players once the room is already active", async () => {
    const service = await createService();
    const host = await service.createRoom({
      name: "Host",
      targetPlayerCount: 2,
      fogEnabled: false
    });
    const guest = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Guest"
    });
    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: host.seat.playerId,
      factionId: "red-rust"
    });
    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: guest.seat.playerId,
      factionId: "blue-steel"
    });
    await service.startRoom({
      roomCode: host.room.roomCode,
      viewerPlayerId: host.seat.playerId
    });

    await expect(
      service.joinRoom({
        roomCode: host.room.roomCode,
        name: "Replacement"
      })
    ).rejects.toThrow("这个房间已经不能加入了。");
  });

  it("returns a finished online game to the same lobby with seats and factions preserved", async () => {
    const { service, store } = await createServiceWithStore();
    const host = await service.createRoom({
      name: "Host",
      targetPlayerCount: 2,
      fogEnabled: false
    });
    const guest = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Guest"
    });
    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: host.seat.playerId,
      factionId: "red-rust"
    });
    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: guest.seat.playerId,
      factionId: "blue-steel"
    });
    const activeRoom = await service.startRoom({
      roomCode: host.room.roomCode,
      viewerPlayerId: host.seat.playerId
    });
    await store.saveRoom({
      ...activeRoom,
      status: "finished",
      gameState: {
        ...activeRoom.gameState!,
        phase: "victory",
        winnerId: host.seat.playerId
      }
    });

    const lobby = await service.returnToLobby({
      roomCode: host.room.roomCode,
      viewerPlayerId: guest.seat.playerId
    });
    const restarted = await service.startRoom({
      roomCode: host.room.roomCode,
      viewerPlayerId: host.seat.playerId
    });

    expect(lobby.status).toBe("lobby");
    expect(lobby.gameState).toBeUndefined();
    expect(lobby.lastCommand).toBeUndefined();
    expect(lobby.seats.map((seat) => [seat.playerId, seat.name, seat.factionId])).toEqual([
      ["p1", "Host", "red-rust"],
      ["p2", "Guest", "blue-steel"]
    ]);
    expect(restarted.status).toBe("active");
    expect(restarted.gameState?.players.map((player) => player.factionId)).toEqual(["red-rust", "blue-steel"]);
  });

  it("does not return an active online game to the lobby before it is finished", async () => {
    const service = await createService();
    const host = await service.createRoom({
      name: "Host",
      targetPlayerCount: 2,
      fogEnabled: false
    });
    const guest = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Guest"
    });
    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: host.seat.playerId,
      factionId: "red-rust"
    });
    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: guest.seat.playerId,
      factionId: "blue-steel"
    });
    await service.startRoom({
      roomCode: host.room.roomCode,
      viewerPlayerId: host.seat.playerId
    });

    await expect(
      service.returnToLobby({
        roomCode: host.room.roomCode,
        viewerPlayerId: guest.seat.playerId
      })
    ).rejects.toThrow("这个房间还在游戏中。");
  });

  it("enforces online authorization when applying commands", async () => {
    const service = await createService();
    const host = await service.createRoom({
      name: "Host",
      targetPlayerCount: 2,
      fogEnabled: true
    });
    const guest = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Guest"
    });
    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: host.seat.playerId,
      factionId: "red-rust"
    });
    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: guest.seat.playerId,
      factionId: "blue-steel"
    });
    const room = await service.startRoom({
      roomCode: host.room.roomCode,
      viewerPlayerId: host.seat.playerId
    });
    const nonCurrentPlayerId =
      room.gameState?.currentPlayerId === host.seat.playerId ? guest.seat.playerId : host.seat.playerId;

    await expect(
      service.applyPlayerCommand({
        roomCode: host.room.roomCode,
        viewerPlayerId: nonCurrentPlayerId,
        command: { type: "placeInitialCamp", vertexId: "v-0-0" }
      })
    ).rejects.toThrow(OnlineRoomError);
  });

  it("uses current route costs when applying online build commands", async () => {
    const { service, store } = await createServiceWithStore();
    const host = await service.createRoom({
      name: "Host",
      targetPlayerCount: 2,
      fogEnabled: false
    });
    const guest = await service.joinRoom({
      roomCode: host.room.roomCode,
      name: "Guest"
    });
    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: host.seat.playerId,
      factionId: "red-rust"
    });
    await service.chooseFaction({
      roomCode: host.room.roomCode,
      playerId: guest.seat.playerId,
      factionId: "blue-steel"
    });
    const room = await service.startRoom({
      roomCode: host.room.roomCode,
      viewerPlayerId: host.seat.playerId
    });

    let state = advanceToAction(room.gameState!);
    state = applyCommand(state, {
      type: "debugSetResources",
      playerId: state.currentPlayerId,
      resources: createResources({ wood: 1, metal: 1, ammo: 1, fuel: 1 })
    });
    room.gameState = state;
    await store.saveRoom(room);

    const transportEdgeId = legalBuildEdges(state, "transport")[0];
    const afterTransport = await service.applyPlayerCommand({
      roomCode: room.roomCode,
      viewerPlayerId: state.currentPlayerId,
      command: { type: "buildRoute", edgeId: transportEdgeId, routeType: "transport" }
    });
    expect(
      afterTransport.gameState?.players.find((player) => player.id === afterTransport.gameState?.currentPlayerId)?.resources
    ).toMatchObject({
      wood: 0,
      metal: 0,
      fuel: 1,
      ammo: 1
    });

    state = applyCommand(afterTransport.gameState!, {
      type: "debugSetResources",
      playerId: afterTransport.gameState!.currentPlayerId,
      resources: createResources({ wood: 1, metal: 1, ammo: 1, fuel: 1 })
    });
    await store.saveRoom({ ...afterTransport, gameState: state });

    const convoyEdgeId = legalBuildEdges(state, "convoy")[0];
    const afterConvoy = await service.applyPlayerCommand({
      roomCode: room.roomCode,
      viewerPlayerId: state.currentPlayerId,
      command: { type: "buildRoute", edgeId: convoyEdgeId, routeType: "convoy" }
    });
    expect(
      afterConvoy.gameState?.players.find((player) => player.id === afterConvoy.gameState?.currentPlayerId)?.resources
    ).toMatchObject({
      wood: 1,
      metal: 1,
      fuel: 0,
      ammo: 0
    });
  });

  it("restores persisted sessions after a disconnect", async () => {
    const service = await createService();
    const created = await service.createRoom({
      name: "Host",
      targetPlayerCount: 2,
      fogEnabled: true
    });

    await service.markDisconnected({
      roomCode: created.room.roomCode,
      playerId: created.seat.playerId
    });
    const resumed = await service.resumeSession({
      roomCode: created.room.roomCode,
      sessionToken: created.seat.sessionToken
    });

    expect(resumed?.seat.playerId).toBe(created.seat.playerId);
    expect(resumed?.seat.connected).toBe(true);
  });
});

function advanceToAction(initialState: GameState): GameState {
  let state = initialState;
  while (state.phase === "setup") {
    state = applyCommand(state, { type: "placeInitialCamp", vertexId: legalInitialCampVertices(state)[0] });
    state = applyCommand(state, { type: "placeInitialRoute", edgeId: legalInitialRouteEdges(state)[0] });
    if (state.pending?.kind === "chooseResource") {
      state = applyCommand(state, { type: "chooseResource", resources: { food: state.pending.amount } });
    }
  }
  return applyCommand(state, { type: "rollDice", forced: [1, 1] });
}

class TransactionCountingFileStore extends FileRoomStore {
  transactionCount = 0;

  async withRoomTransaction<T>(
    roomCode: string,
    task: (transaction: RoomStoreTransaction) => Promise<T>
  ): Promise<T> {
    this.transactionCount += 1;
    return task({
      loadRoom: () => this.loadRoom(roomCode),
      saveRoom: (room) => this.saveRoom(room),
      deleteRoom: () => this.deleteRoom(roomCode)
    });
  }
}
