import { expect, test, type Page } from "@playwright/test";

async function waitForHumanOrSettlement(page: Page): Promise<"human" | "settled"> {
  await expect
    .poll(
      async () => {
        if ((await page.getByText("本手已结算").count()) > 0) return "settled";
        const fold = page.getByRole("button", { name: "弃牌" });
        if ((await fold.count()) > 0 && (await fold.isEnabled())) return "human";
        return "waiting";
      },
      { timeout: 20_000 },
    )
    .not.toBe("waiting");
  return (await page.getByText("本手已结算").count()) > 0 ? "settled" : "human";
}

async function finishHandByFolding(page: Page): Promise<void> {
  const state = await waitForHumanOrSettlement(page);
  if (state === "human") {
    await page.getByRole("button", { name: "弃牌" }).click();
  }
  await expect(page.getByText("本手已结算")).toBeVisible({ timeout: 20_000 });
}

async function startNextHand(page: Page): Promise<void> {
  const next = page.getByRole("button", { name: /下一手|补充 1,000 虚拟筹码并继续/ });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page.getByText("本手已结算")).toBeHidden({ timeout: 20_000 });
}

test("plays three hands, folds early, and recovers after refresh", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "五人桌 · 本地机器人" })).toBeVisible({
    timeout: 20_000,
  });

  const gameId = await page.evaluate(() => localStorage.getItem("poker-ai.gameId"));
  expect(gameId).toBeTruthy();

  // V03: the network DTO must never contain the deck, undo history, or a
  // private decision field. Opponent cards are null until explicitly shown.
  const wire = await page.request.get(`/api/game/state?gameId=${gameId}`);
  expect(wire.status()).toBe(200);
  const wireText = await wire.text();
  expect(wireText).not.toContain('"deck"');
  expect(wireText).not.toContain('"previousStates"');
  expect(wireText).not.toContain("decisionSummary");

  // Hand 1: fold on the first human decision, then let the local bots finish.
  await finishHandByFolding(page);
  await startNextHand(page);
  await expect(page.getByText(/第 2 手/)).toBeVisible();

  // Refresh must recover the same server-owned game, not create a new one.
  await page.reload();
  await expect(page.getByRole("heading", { name: "五人桌 · 本地机器人" })).toBeVisible({
    timeout: 20_000,
  });
  expect(await page.evaluate(() => localStorage.getItem("poker-ai.gameId"))).toBe(gameId);
  await expect(page.getByText(/第 2 手/)).toBeVisible();

  // Hand 2 and 3: early folds, then explicit next-hand transitions.
  await finishHandByFolding(page);
  await startNextHand(page);
  await expect(page.getByText(/第 3 手/)).toBeVisible();

  await finishHandByFolding(page);
  await expect(
    page.getByRole("button", { name: /下一手|补充 1,000 虚拟筹码并继续/ }),
  ).toBeVisible();
});
