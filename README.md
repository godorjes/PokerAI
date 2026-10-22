# Poker AI V3.2

Server-authoritative five-seat no-limit Texas Hold'em. This repository currently contains the Stage A rule engine and contract tests; the browser table and AI integration arrive in later stages.

## Requirements

- Node.js `>=24.15.0` (the selected engine requires it)
- pnpm `11.7.0` (declared in `package.json`; use a compatible Corepack/pnpm)

The current runtime must use Node 24.21.0 or another version satisfying the engine range. A PATH Node 21 is not sufficient.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm test:rules
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm build` currently compiles the Stage A domain modules with `tsc`; the Next.js shell is added in Stage B.

## Stage A status

- Rule engine: `@pokertools/engine@2.1.0`
- Hand evaluator: `@pokertools/evaluator@2.1.0`
- All G01–G09 and G11 scenarios are covered by executable tests.
- Stage B (five-seat table, local bots, session lifecycle) is not implemented yet.

See:

- `docs/specs/poker-ai-v3.2.md`
- `docs/specs/deepseek-development-handoff.md`
- `docs/plans/implementation-plan.md`
- `docs/plans/rule-engine-assessment.md`
- `docs/progress.md`
