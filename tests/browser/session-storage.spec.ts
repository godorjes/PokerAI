import { expect, test } from "@playwright/test";

test("K02: sessionStorage survives refresh and is empty in a newly opened tab", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "五人桌 · 本地 / 智能机器人" })).toBeVisible({
    timeout: 20_000,
  });
  await page.evaluate(() => sessionStorage.setItem("poker-ai.deepseek-key", "k02-tab-key"));

  await page.reload();
  await expect(page.getByRole("heading", { name: "五人桌 · 本地 / 智能机器人" })).toBeVisible({
    timeout: 20_000,
  });
  expect(await page.evaluate(() => sessionStorage.getItem("poker-ai.deepseek-key"))).toBe(
    "k02-tab-key",
  );

  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/");
  await expect(reopened.getByRole("heading", { name: "五人桌 · 本地 / 智能机器人" })).toBeVisible({
    timeout: 20_000,
  });
  expect(await reopened.evaluate(() => sessionStorage.getItem("poker-ai.deepseek-key"))).toBeNull();
  await reopened.close();
});
