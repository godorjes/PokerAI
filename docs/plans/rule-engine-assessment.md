# Stage A 规则引擎能力与缺口记录

- 记录日期：2026-10-22
- 状态：**Stage A 已完成，Stage B 未开始**
- 选定运行库：`@pokertools/engine@2.1.0`（MIT）
- 牌型评估：`@pokertools/evaluator@2.1.0`（MIT）
- 实际运行环境：Node.js `24.21.0`、pnpm `11.7.0`
- 包版本锁定：见 `package.json` 与 `pnpm-lock.yaml`

> 本文只记录实际安装版本、代码阅读、实际执行的测试及其结果。没有运行过的浏览器、真实 DeepSeek API、Next.js 构建，不写成已通过。

## 1. 选型结论

采用 `@pokertools/engine@2.1.0` 作为 Stage A 的下注/结算核心：

- 它是完整的无限注德州下注引擎，不是单纯牌型比较库。
- 配置层允许 `maxPlayers` 2—10；本项目实际以 5 座运行并通过测试。
- 已实际验证短全下、重新开放加注、边池、未跟注退款、零头、短大盲和公开视图。
- 牌型比较由 `@pokertools/evaluator` 承担，Stage A 的 G09 测试直接覆盖评估器边界。

没有采用 `poker-engine-ts@0.1.3`：它的 `maxSeats` 类型只允许 `2 | 6 | 9`，与固定 5 座不符。若将来需要改用它，必须先决定“6 座空位/fork”还是其他方案，不能静默改变产品模型。

## 2. 已确认能力

| 能力                  | 验证方式                                                          | 结果   |
| --------------------- | ----------------------------------------------------------------- | ------ |
| 5 座配置              | `createPokerTable` + 5 座完整测试                                 | 通过   |
| 盲注/按钮/行动顺序    | G01、G06、G11 与工厂测试                                          | 通过   |
| 金额为累计目标额      | G01：BB 10 加注至 30，只再扣 20                                   | 通过   |
| 短全下不重新开放      | G02：30 → 45，C 最小加注 65，A 不能再加                           | 通过   |
| 累计短全下重新开放    | G03：30 → 45 → 50，A 最小加注 70                                  | 通过   |
| 主池/边池资格         | G04/G05：A 350、B 400、C 退回 200                                 | 通过   |
| 未跟注金额退回        | G04 的 `uncalled_return` 事件为 200                               | 通过   |
| 大盲选项              | G06：翻前全员跟注后 BB 仍可过牌/加注                              | 通过   |
| 一人全下后继续下注    | G07：其他玩家仍可加注，未提前发完                                 | 通过   |
| 弃牌结束/平局零头     | G08：弃牌立即结算；45 池四人均分，按钮左侧首个赢家得零头          | 通过   |
| A2345/踢脚/公共牌最佳 | G09 四组评估器测试                                                | 通过   |
| 短大盲 bring-in       | G11：BB 仅 3，UTG 跟注 10、最小加注 20，BB 被跳过                 | 通过   |
| 公开/机器人视图       | 公开视图测试：只显示自己/已亮牌，不出现牌堆/配置/`previousStates` | 通过   |
| 牌型比较库边界        | G09 独立评估器测试；明确不是完整下注引擎                          | 已记录 |

## 3. 适配层实际补充的能力

库本身不提供本项目所需的完整接口，以下由 `src/server/engine` 补充并测试：

1. **`action + amountTo` 协议**
   - `bet/raise` 的 `amountTo` 转成库的累计目标额。
   - `all_in` 在无当前下注时映射为 `BET`，有当前下注时映射为 `RAISE` 或 `CALL`。
   - 不自动夹取金额；非法金额返回 `INVALID_AMOUNT`。
2. **合法动作查询**
   - 从 `currentBets`、`minRaise`、`lastRaiseAmount`、行动历史推导 `LegalActionView`。
   - 返回 `toCall/minBetTo/minRaiseTo/maxTo/canOnlyShortAllIn`。
   - 与库的 `validate` 方向一致；测试覆盖正常加注、短全下、不能再加注、短跟注。
3. **视图白名单**
   - 不直接序列化库的 `GameState`。
   - 自己的底牌或摊牌已亮牌；不返回 `deck`、`config`、`previousStates`、`randomProvider`。
4. **首手随机按钮**
   - 库的首次 `deal()` 会选择第一个座位，不是随机按钮。
   - 适配器使用公开的 `snapshot/restore`，把发牌前按钮设为目标座位的前一位；`deal()` 后得到目标按钮。工厂测试实际执行。
5. **测试固定牌序**
   - 库没有直接传入固定牌堆的 `deal(deck)` 参数。
   - 测试用脚本化 `randomProvider` 反推 Fisher-Yates；使用目标桶中点避免浮点边界误判。
   - 这是测试专用路径，生产使用库的 Node `crypto` 默认随机源。
6. **赢家聚合**
   - 库可能为同一座位的不同池分别产生多条 `Winner` 记录。
   - 适配器按座位累加金额，避免界面重复显示/少算。

## 4. 实际测试结果

执行命令（通过 Node 24.21 的 bundled pnpm）：

```text
pnpm test -- --reporter=verbose
```

结果：

```text
Test Files  13 passed (13)
Tests       21 passed (21)
```

覆盖文件：

- `tests/rules/g01-amount-to.test.ts`
- `tests/rules/g02-short-allin-no-reopen.test.ts`
- `tests/rules/g03-cumulative-short-allin-reopen.test.ts`
- `tests/rules/g04-side-pots-uncalled.test.ts`
- `tests/rules/g05-side-pot-payout.test.ts`
- `tests/rules/g06-big-blind-option.test.ts`
- `tests/rules/g07-allin-continue-betting.test.ts`
- `tests/rules/g08-fold-win-and-tie-odd-chip.test.ts`
- `tests/rules/g09-hand-ranking.test.ts`
- `tests/rules/g11-short-bb-bringin.test.ts`
- `tests/contracts/amount-and-actions.test.ts`
- `tests/contracts/public-view.test.ts`
- `tests/contracts/table-factory.test.ts`

其他检查：

```text
pnpm format:check  通过
pnpm typecheck     通过
pnpm lint          通过
pnpm build         通过（tsc 编译 Stage A 领域模块）
```

详细命令输出记录在 `docs/progress.md`。

## 5. 未解决问题与 Stage B 依赖

- **Next.js shell 尚未创建**：Stage A 以 TypeScript 领域包和 `tsc` 构建验证；浏览器牌桌、五个座位 UI、API、Next.js 构建在 Stage B 加入。这不是规则验收的替代。
- **会话层尚未实现**：`turnId/stateVersion/PendingDecision/ownerId` 属于 Stage B/C；Stage A 的 `turnId` 只是事件内的简单序列，不是并发调度凭据。
- **固定牌序是测试钩子**：依赖库公开的 `randomProvider` 与 Fisher-Yates 实现；升级库版本时必须重跑测试，不能把测试辅助代码放进生产路径。
- **首手按钮使用公开快照补位**：不是库的专用 setter；升级时需要回归。
- **没有 G10**：手间补码属于 Stage B，不在本阶段伪造。
- **没有真实浏览器或真实 DeepSeek 调用**：Stage A 不涉及；不能把本地测试当作这些验收已完成。

## 6. 资料来源

- `@pokertools/engine@2.1.0`：<https://www.npmjs.com/package/@pokertools/engine>，源码/README <https://github.com/aaurelions/pokertools/tree/main/packages/engine>。
- `@pokertools/evaluator@2.1.0`：<https://www.npmjs.com/package/@pokertools/evaluator>。
- `poker-engine-ts@0.1.3`（备选，未采用）：<https://www.npmjs.com/package/poker-engine-ts>，源码 <https://github.com/Ge-limin/poker-engine-ts>。
- `pokersolver@2.1.4`（只做牌型比较）：<https://github.com/goldfire/pokersolver>。
