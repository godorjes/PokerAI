import { expect, test } from "@playwright/test";

test("opens a public-only insight bound to a submitted bot action", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "五人桌 · 本地 / 智能机器人" })).toBeVisible({
    timeout: 20_000,
  });

  const fold = page.getByRole("button", { name: "弃牌" });
  if ((await fold.count()) > 0 && (await fold.isEnabled())) {
    await fold.click();
  }

  const insightButton = page.getByRole("button", { name: "思路" }).first();
  await expect(insightButton).toBeVisible({ timeout: 20_000 });
  await insightButton.click();

  const dialog = page.getByRole("dialog", { name: "公开行动解读" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("基于公开信息的行动解读，不代表真实手牌或完整内部决策理由。"),
  ).toBeVisible();
  await expect(dialog.getByText(/绑定动作：/)).toBeVisible();
  await expect(dialog.getByText(/公开信息不足以确定/)).toBeVisible();
  await expect(dialog.getByText(/诈唬/)).toHaveCount(0);

  await dialog.getByRole("button", { name: "关闭" }).click();
  await expect(dialog).toBeHidden();
});
