// @vitest-environment node

import { describe, expect, it } from "vitest";
import { resolveAllowedCorsOrigins, resolveRoomStoreDriver } from "../../../server/config.ts";

describe("server config", () => {
  it("parses explicit CloudBase/static-hosting origins for production CORS", () => {
    expect(
      resolveAllowedCorsOrigins({
        CORS_ORIGINS: "https://game.example.com, https://zombie-catan.cloudbaseapp.com "
      })
    ).toEqual(["https://game.example.com", "https://zombie-catan.cloudbaseapp.com"]);
  });

  it("keeps localhost available for development but does not allow every origin in production", () => {
    expect(resolveAllowedCorsOrigins({ NODE_ENV: "development" })).toContain("http://127.0.0.1:5173");
    expect(resolveAllowedCorsOrigins({ NODE_ENV: "production" })).toEqual([]);
  });

  it("defaults production room storage to CloudBase and development storage to files", () => {
    expect(resolveRoomStoreDriver({ NODE_ENV: "production" })).toBe("cloudbase");
    expect(resolveRoomStoreDriver({})).toBe("cloudbase");
    expect(resolveRoomStoreDriver({ NODE_ENV: "development" })).toBe("file");
    expect(resolveRoomStoreDriver({ NODE_ENV: "test" })).toBe("file");
    expect(resolveRoomStoreDriver({ NODE_ENV: "production", ROOM_STORE_DRIVER: "file" })).toBe("file");
  });
});
