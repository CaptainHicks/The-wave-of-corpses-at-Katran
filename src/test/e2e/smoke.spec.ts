import { expect, test } from "@playwright/test";

test("creates a hot-seat game and exposes text state", async ({ page }) => {
  await page.goto("/");
  await page.locator(".start-menu-button-primary").click();
  await page.locator(".start-mode-card-active").click();
  await page.locator(".start-confirm-button").click();
  await expect(page.locator(".board-svg")).toBeVisible();
  await expect(page.locator("image.tile-art")).toHaveCount(72);
  const textState = await page.evaluate(() => window.render_game_to_text?.());
  expect(textState).toBeTruthy();
  const parsed = JSON.parse(textState ?? "{}");
  expect(parsed.mode).toBe("hot-seat");
  expect(parsed.phase).toBe("setup");
});
