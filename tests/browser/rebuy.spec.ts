import { expect, test } from "@playwright/test";

test.skip(
  process.env.POKER_TEST_REBUY !== "1",
  "Set POKER_TEST_REBUY=1 and start the server with POKER_STAGE_B_TEST_TABLE=1",
);

test("human busts, sees the rebuy action, and starts the next hand with chips", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "五人桌 · 本地 / 智能机器人" })).toBeVisible({
    timeout: 20_000,
  });

  const call = page.getByRole("button", { name: /跟注/ });
  await expect(call).toBeEnabled({ timeout: 20_000 });
  await call.click();

  await expect(page.getByText("本手已结算")).toBeVisible({ timeout: 20_000 });
  const rebuy = page.getByRole("button", { name: /补充 1,000 虚拟筹码并继续/ });
  await expect(rebuy).toBeVisible();

  await rebuy.click();
  await expect(page.getByText(/第 2 手/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("本手已结算")).toBeHidden();
  await expect(page.getByRole("button", { name: /下一手|补充 1,000 虚拟筹码并继续/ })).toBeHidden();
});
