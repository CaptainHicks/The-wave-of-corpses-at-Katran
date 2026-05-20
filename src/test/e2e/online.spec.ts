import { expect, test } from "@playwright/test";

test("creates, starts, and resumes an online room", async ({ browser }) => {
  const hostPage = await browser.newPage();
  const guestPage = await browser.newPage();

  await hostPage.goto("/");
  await hostPage.getByRole("button", { name: "开始游戏" }).click();
  await hostPage.getByRole("button", { name: "在线联机" }).click();
  await hostPage.getByLabel("在线玩家名称").fill("房主A");
  await hostPage.getByRole("button", { name: "创建在线房间" }).click();

  const roomTitle = hostPage.getByRole("heading", { name: /房间 / });
  await expect(roomTitle).toBeVisible();
  const roomText = await roomTitle.textContent();
  const roomCodeMatch = roomText?.match(/房间\s+([A-Z0-9]+)/);
  expect(roomCodeMatch?.[1]).toBeTruthy();
  const roomCode = roomCodeMatch![1];

  await guestPage.goto("/");
  await guestPage.getByRole("button", { name: "开始游戏" }).click();
  await guestPage.getByRole("button", { name: "在线联机" }).click();
  await guestPage.getByLabel("在线玩家名称").fill("玩家B");
  await guestPage.getByLabel("在线玩家阵营").selectOption({ index: 1 });
  await guestPage.getByLabel("在线房间码").fill(roomCode);
  await guestPage.getByRole("button", { name: "加入在线房间" }).click();

  await expect(hostPage.getByText(/当前 2\/2 人/)).toBeVisible();
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
