# Poker AI V3.2

Server-authoritative five-seat no-limit Texas Hold'em. The current repository implements Stage A rule contracts, the Stage B no-key playable table, and Stage C BYOK/mode/pending-control infrastructure. Real model quality and Stage D decision acceptance are not complete.

## Requirements

- Node.js `>=24.15.0` (the rule engine requires it)
- pnpm `11.7.0` (declared in `package.json`)
- A browser for the table; Playwright tests use the installed Chrome channel

The current runtime must use Node 24.21.0 or another version satisfying the engine range. A PATH Node 21 is not sufficient.

## Start

```bash
pnpm install --frozen-lockfile
pnpm dev
# http://127.0.0.1:3000
```

The app starts with four local bots. A DeepSeek Key is optional; if supplied it is kept in the current tab's `sessionStorage` and sent only as a per-request header for `/api/ai/test` and `/api/ai/decision`.

A browser refresh restores the game only while the same Node process still holds the in-memory session (30-minute idle TTL). A process restart returns `SESSION_NOT_FOUND` and the UI asks for a new table.

## Commands

```bash
pnpm test
pnpm test:rules
pnpm test:contracts
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm test:browser   # requires the dev server at 127.0.0.1:3000
```

`pnpm test:browser` skips the deterministic rebuy scenario unless the test server is started with `POKER_STAGE_B_TEST_TABLE=1` and `POKER_TEST_REBUY=1` is set for the Playwright process. This fixture is development/test-only; production uses the secure random table factory.

## Current scope

- Five fixed seats, 5/10 blinds, 1,000 starting chips.
- Human actions and local bot turn-by-turn progression.
- Settlement, action log, next hand, bot auto top-up, human rebuy.
- Anonymous HttpOnly cookie ownership; single-process in-memory sessions.
- Key test/clear/rotate, `aiEpoch`, PendingDecision, duplicate-turn and stale-epoch control.
- No real DeepSeek request has been made in tests; Stage D still owns prompt/thinking/usage and A01/A02 acceptance.
- No account, database, or real-player multiplayer.

## API surface

```text
POST /api/game/start
GET  /api/game/state
POST /api/game/action
POST /api/game/next
POST /api/ai/test
POST /api/ai/mode
POST /api/ai/decision
```

The DeepSeek destination is fixed to `https://api.deepseek.com`; the Key is never stored in the game session, URL, body, or cache.

See:

- `docs/specs/poker-ai-v3.2.md`
- `docs/specs/deepseek-development-handoff.md`
- `docs/plans/implementation-plan.md`
- `docs/plans/rule-engine-assessment.md`
- `docs/plans/stage-b-report.md`
- `docs/plans/stage-c-report.md`
- `docs/progress.md`
