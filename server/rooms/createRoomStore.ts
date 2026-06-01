import path from "node:path";
import { resolveRoomStoreDriver } from "../config";
import { CloudBaseRoomStore } from "./cloudBaseRoomStore";
import { FileRoomStore } from "./fileRoomStore";
import type { RoomStore } from "./roomStore";

export function createRoomStore(): RoomStore {
  const driver = resolveRoomStoreDriver();

  if (driver === "cloudbase") {
    return new CloudBaseRoomStore();
  }

  if (driver === "file") {
    const persistRoot = path.resolve(process.env.ROOMS_DATA_DIR ?? path.resolve(process.cwd(), "data"));
    const roomsDir = path.join(persistRoot, "rooms");
    return new FileRoomStore({ rootDir: roomsDir });
  }

  throw new Error(`Unsupported ROOM_STORE_DRIVER: ${driver}`);
}
