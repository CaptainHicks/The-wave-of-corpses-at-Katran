import { expect, test } from "@playwright/test";

test("creates a hot-seat game and exposes text state", async ({ page }) => {
  await page.goto("/");
  await page.locator(".start-menu-button-primary").click();
  await page.getByRole("button", { name: "本地热座" }).click();
  await page.getByLabel("玩家 1 阵营").selectOption("red-rust");
  await page.getByLabel("玩家 2 阵营").selectOption("blue-steel");
  await page.getByLabel("玩家 3 阵营").selectOption("green-oasis");
  await page.getByLabel("玩家 4 阵营").selectOption("gold-sand");
  await page.locator(".start-confirm-button").click();
  await expect(page.locator(".board-svg")).toBeVisible();
  await expect(page.locator("image.tile-art")).toHaveCount(72);
  const textState = await page.evaluate(() => window.render_game_to_text?.());
  expect(textState).toBeTruthy();
  const parsed = JSON.parse(textState ?? "{}");
  expect(parsed.mode).toBe("hot-seat");
  expect(parsed.phase).toBe("setup");
});
