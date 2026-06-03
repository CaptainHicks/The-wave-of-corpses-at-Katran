import { describe, expect, it } from "vitest";
import { localizeOnlineError } from "../../online/useOnlineSession";

describe("online session error localization", () => {
  it("localizes server and socket errors before they are shown", () => {
    expect(localizeOnlineError("Room not found.")).toBe("没有找到这个房间。");
    expect(localizeOnlineError("This room is already full.")).toBe("这个房间已经满员了。");
    expect(localizeOnlineError("Timed out waiting for room:command acknowledgement.")).toBe(
      "联机请求超时，请检查网络后重试。"
    );
    expect(localizeOnlineError("websocket error")).toBe("联机连接失败，请检查网络或稍后重试。");
  });

  it("uses a localized fallback for blank errors", () => {
    expect(localizeOnlineError("   ")).toBe("联机请求失败，请稍后重试。");
  });
});
