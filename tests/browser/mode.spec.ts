import { expect, test } from "@playwright/test";

test("mode API advances epoch on rotate and can be disabled without a key", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "五人桌 · 本地 / 智能机器人" })).toBeVisible({
    timeout: 20_000,
  });
  const gameId = await page.evaluate(() => localStorage.getItem("poker-ai.gameId"));
  expect(gameId).toBeTruthy();

  // Stop the page's automatic bot loop so the expectedVersion is stable.
  await page.close();

  const stateResponse = await context.request.get(`/api/game/state?gameId=${gameId}`);
  const state = (await stateResponse.json()) as {
    stateVersion: number;
    aiEpoch: number;
    aiMode: string;
  };
  expect(state.aiMode).toBe("disabled");

  const enabledResponse = await context.request.post("/api/ai/mode", {
    data: {
      gameId,
      expectedVersion: state.stateVersion,
      requestId: "mode-enable-browser",
      operation: "enable",
    },
  });
  expect(enabledResponse.status()).toBe(200);
  const enabled = (await enabledResponse.json()) as {
    aiMode: string;
    aiEpoch: number;
    stateVersion: number;
  };
  expect(enabled.aiMode).toBe("enabled");
  expect(enabled.aiEpoch).toBeGreaterThan(state.aiEpoch);

  const rotatedResponse = await context.request.post("/api/ai/mode", {
    data: {
      gameId,
      expectedVersion: enabled.stateVersion,
      requestId: "mode-rotate-browser",
      operation: "rotate",
    },
  });
  const rotated = (await rotatedResponse.json()) as {
    aiMode: string;
    aiEpoch: number;
    stateVersion: number;
  };
  expect(rotated.aiMode).toBe("enabled");
  expect(rotated.aiEpoch).toBeGreaterThan(enabled.aiEpoch);

  const disabledResponse = await context.request.post("/api/ai/mode", {
    data: {
      gameId,
      expectedVersion: rotated.stateVersion,
      requestId: "mode-disable-browser",
      operation: "disable",
    },
  });
  const disabled = (await disabledResponse.json()) as {
    aiMode: string;
    aiEpoch: number;
  };
  expect(disabled.aiMode).toBe("disabled");
  expect(disabled.aiEpoch).toBeGreaterThan(rotated.aiEpoch);
});
