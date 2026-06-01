import { expect, test } from "@playwright/test";

test("creates, joins, chooses factions in lobby, starts, and resumes an online room", async ({ browser }) => {
  const hostPage = await browser.newPage();
  const guestPage = await browser.newPage();

  await hostPage.goto("/");
  await hostPage.getByRole("button", { name: "开始游戏" }).click();
  await hostPage.getByRole("button", { name: "在线联机" }).click();
  await hostPage.getByRole("button", { name: "创建房间" }).click();
  await hostPage.getByLabel("在线玩家名称").fill("房主A");
  await hostPage.getByRole("button", { name: "创建在线房间" }).click();

  await expect(hostPage.getByRole("heading", { name: "房间大厅" })).toBeVisible();
  const copyRoomCodeButton = hostPage.getByRole("button", { name: /复制房间码/ });
  const roomCodeLabel = await copyRoomCodeButton.getAttribute("aria-label");
  const roomCodeMatch = roomCodeLabel?.match(/复制房间码\s+([A-Z0-9]+)/);
  expect(roomCodeMatch?.[1]).toBeTruthy();
  const roomCode = roomCodeMatch![1];

  await hostPage.getByLabel("在线大厅阵营").selectOption("red-rust");

  await guestPage.goto("/");
  await guestPage.getByRole("button", { name: "开始游戏" }).click();
  await guestPage.getByRole("button", { name: "在线联机" }).click();
  await guestPage.getByRole("button", { name: "加入房间" }).click();
  await guestPage.getByLabel("在线加入玩家名称").fill("玩家B");
  for (const [index, digit] of [...roomCode].entries()) {
    await guestPage.getByLabel(`房间码第${index + 1}位`).fill(digit);
  }
  await guestPage.getByRole("button", { name: "加入在线房间" }).click();

  await expect(guestPage.getByRole("heading", { name: "房间大厅" })).toBeVisible();
  await guestPage.getByLabel("在线大厅阵营").selectOption("blue-steel");

  await expect(hostPage.getByRole("heading", { name: /玩家列表\s+\(2\/2\)/ })).toBeVisible();
  await expect(guestPage.getByRole("button", { name: "房主开始游戏" })).toBeDisabled();

  await hostPage.getByRole("button", { name: "房主开始游戏" }).click();
  await expect(hostPage.locator(".board-svg")).toBeVisible();
  await expect(guestPage.locator(".board-svg")).toBeVisible();
  await expect(guestPage.getByText("等待其他玩家行动")).toBeVisible();

  const hostTextState = await hostPage.evaluate(() => window.render_game_to_text?.());
  const guestTextState = await guestPage.evaluate(() => window.render_game_to_text?.());
  expect(JSON.parse(hostTextState ?? "{}").mode).toBe("online");
  expect(JSON.parse(guestTextState ?? "{}").mode).toBe("online");

  await guestPage.reload();
  await expect(guestPage.locator(".board-svg")).toBeVisible();
  await expect(guestPage.getByText("等待其他玩家行动")).toBeVisible();
  const resumedState = JSON.parse((await guestPage.evaluate(() => window.render_game_to_text?.())) ?? "{}");
  expect(resumedState.mode).toBe("online");
  expect(resumedState.viewerPlayer).toBe("玩家B");

  await hostPage.close();
  await guestPage.close();
});
