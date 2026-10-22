import { expect, test } from "@playwright/test";

test("rejects another anonymous owner on every Stage B game endpoint", async ({ browser }) => {
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  await pageA.goto("/");
  await expect(pageA.getByRole("heading", { name: "五人桌 · 本地机器人" })).toBeVisible();
  const gameA = await pageA.evaluate(() => localStorage.getItem("poker-ai.gameId"));
  expect(gameA).toBeTruthy();

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.goto("/");
  await expect(pageB.getByRole("heading", { name: "五人桌 · 本地机器人" })).toBeVisible();
  const gameB = await pageB.evaluate(() => localStorage.getItem("poker-ai.gameId"));
  expect(gameB).toBeTruthy();
  expect(gameB).not.toBe(gameA);

  const state = await pageB.request.get(`/api/game/state?gameId=${gameA}`);
  expect(state.status()).toBe(404);

  const action = await pageB.request.post("/api/game/action", {
    data: {
      gameId: gameA,
      handId: "foreign-hand",
      turnId: "foreign-turn",
      expectedVersion: 1,
      requestId: "foreign-action",
      action: "fold",
      amountTo: null,
    },
  });
  expect(action.status()).toBe(404);

  const next = await pageB.request.post("/api/game/next", {
    data: {
      gameId: gameA,
      expectedVersion: 1,
      requestId: "foreign-next",
    },
  });
  expect(next.status()).toBe(404);

  const decision = await pageB.request.post("/api/ai/decision", {
    data: {
      gameId: gameA,
      handId: "foreign-hand",
      turnId: "foreign-turn",
      expectedVersion: 1,
      requestId: "foreign-decision",
    },
  });
  expect(decision.status()).toBe(404);

  await contextA.close();
  await contextB.close();
});
