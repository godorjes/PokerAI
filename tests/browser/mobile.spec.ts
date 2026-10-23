import { expect, test } from "@playwright/test";

test("mobile layout exposes bet controls and the local degradation status", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "五人桌 · 本地 / 智能机器人" })).toBeVisible({
    timeout: 20_000,
  });

  await expect(page.getByText("未配置")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  const fold = page.getByRole("button", { name: "弃牌" });
  await expect(fold).toBeEnabled({ timeout: 20_000 });

  const wager = page.getByRole("button", { name: /^(加注|下注)$/ }).first();
  await expect(wager).toBeEnabled({ timeout: 20_000 });
  await wager.click();
  await expect(page.getByText(/加注至|下注至/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/本地（无 Key）/)).toBeVisible({ timeout: 20_000 });
});
