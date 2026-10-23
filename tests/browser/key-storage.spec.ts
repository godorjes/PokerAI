import { expect, test } from "@playwright/test";

test("stores the key only in sessionStorage and clears the local copy", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "五人桌 · 本地 / 智能机器人" })).toBeVisible({
    timeout: 20_000,
  });

  await page.evaluate(() => sessionStorage.setItem("poker-ai.deepseek-key", "test-key-not-real"));
  await page.reload();
  const keyInput = page.getByPlaceholder("sk-…");
  await expect(keyInput).toHaveValue("test-key-not-real");
  await expect(page.getByText("已保存，未测试")).toBeVisible();

  expect(await page.evaluate(() => localStorage.getItem("poker-ai.deepseek-key"))).toBeNull();

  await page.getByRole("button", { name: "清除 Key" }).click();
  await expect(keyInput).toHaveValue("");
  expect(await page.evaluate(() => sessionStorage.getItem("poker-ai.deepseek-key"))).toBeNull();
});
