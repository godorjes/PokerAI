# Poker AI V3.2 — A—E 实施计划

- 状态：计划稿。**本轮只做检查、选型分析与计划，不实现业务功能。**
- 总规范：`Poker-AI-V3.2-development-outline.md`（本轮完整读取的附件原件）
- 交接说明：`DeepSeek-development-handoff.md`（本轮完整读取的附件原件）
- 目标项目：`F:\code\PokerAI`
- 本轮核查日期：2026-10-22（以交接材料标注日期为准；本机日期未能通过命令确认）

> 本计划区分“规范已定”“本轮从公开资料或源码核实”“尚待本地实测”三类信息。没有运行过的测试、没有安装过的依赖、没有调用过的 API，均不会写成已完成。

---

## 0. 本轮结论摘要

1. **文件能力可用**：已实际创建、读取、覆盖工作区文件；`.dsh-write-test` 是文件写入探针。
2. **命令能力当前不可用**：所有 `pwsh` 调用都在启动阶段失败，退出码 `3221225794`（十六进制 `0xC0000142`，Windows `STATUS_DLL_INIT_FAILED`），没有 stdout/stderr。因此本轮无法安装依赖、运行测试、执行 Git 或启动浏览器。
3. **项目当前是空目录**：没有 `package.json`、`AGENTS.md`、`.git`、`docs/specs` 或业务代码；不能声称已有实现或已有修改。
4. **规则引擎必须先做 A1 最小实测**，不能仅凭 README 采用。主候选是 `@pokertools/engine@2.1.0`（完整无限注下注引擎），备选是 `poker-engine-ts@0.1.3`（完整事件溯源引擎，但座位类型只支持 2/6/9）。`pokersolver` 等只做牌型比较，不是完整下注引擎。
5. **阶段顺序固定为 A → B → C → D → E**。A 的核心规则未通过前，不进入牌桌和 AI 阶段。
6. 本轮没有创建 `docs/specs` 下的规范副本。项目内规范路径不存在；为避免生成可能与原件不一致的第二份“权威规范”，A0 应先逐字导入并记录来源，再继续实现。

---

## 1. 产品范围与不可变边界

### 1.1 首版范围

- 浏览器端 1 名真人与 4 名电脑，固定 5 个座位，无限注德州扑克。
- 每人初始 1,000 虚拟筹码；SB 5、BB 10；无前注、无抽水、无 straddle、固定不涨盲。
- 手间暂停，由用户点击“下一手”；真人弃牌后电脑继续完成本手。
- 支持用户自带 DeepSeek Key（BYOK），智能模式下四名电脑实际使用模型决策。
- 公开行动解读只基于动作发生时的公开信息。
- Next.js + React + TypeScript + Tailwind CSS + Vitest；单实例、单 Node.js 进程、内存会话。

### 1.2 明确不做

账号、数据库、真人联机、房间、锦标赛、排行榜、历史复盘、跨手学习、GTO 求解、精确胜率/EV、原生 App、平台统一付费 Key、Serverless/多副本共享状态。

### 1.3 规范已定的关键语义

- **服务端唯一裁决**：前端和模型只能提出动作，不能修改筹码、公共牌、底池或行动者。
- **金额统一为 `action + amountTo`**：`amountTo` 是本轮累计投入的目标值，不是增量；整数、安全整数范围。
- **合法动作边界**：`legalActions`、`toCall`、`minBetTo`、`minRaiseTo`、`maxTo`、短全下限制；不存在时为 `null`，不得自动夹取金额。
- **信息隔离**：完整引擎状态、真人可见视图、单个机器人决策视图、公开解读视图四类分开；不得序列化完整 `GameSession` 后由前端隐藏。
- **Key 生命周期**：仅 `sessionStorage` 临时保存；只在 `test`/`decision` 请求作用域内经过服务端；不进 Session、日志、缓存、URL、`NEXT_PUBLIC_*`。
- **单实例内存会话**：刷新仅在原进程存活且会话未过期时恢复；重启/发布/内存丢失后返回 `SESSION_EXPIRED`。
- **无账号不等于无鉴权**：HttpOnly/Secure/SameSite Cookie 绑定 `ownerId`；所有接口校验归属；写接口校验同源并做 CSRF 防护。

---

## 2. 当前项目与工具链基线

### 2.1 实际检查结果

| 项目                                   | 结果                               |
| -------------------------------------- | ---------------------------------- |
| 工作区内容                             | 仅有本轮写入探针 `.dsh-write-test` |
| `package.json`                         | 不存在                             |
| 锁文件                                 | 不存在                             |
| `.git`                                 | 不存在                             |
| `AGENTS.md` / 其他项目指令             | 不存在                             |
| `docs/specs/poker-ai-v3.2.md`          | 不存在                             |
| `docs/deepseek-development-handoff.md` | 不存在                             |
| 业务源码、测试、构建产物               | 不存在                             |

规范与交接内容本轮从用户提供的附件路径完整读取；它们不在目标项目内。A0 的第一个动作是把两份文件逐字导入 `docs/specs/` 并记录来源，避免后续会话失去唯一依据。

### 2.2 工具链（本地运行时清单，非项目依赖）

| 工具          | 本地值    | 说明                                                                                                             |
| ------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| Node.js       | `24.21.0` | 从 `C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\runtime.json` 读取；**未执行** `node --version` |
| pnpm          | `11.7.0`  | 同上；**未执行** `pnpm --version`                                                                                |
| 包管理器      | pnpm      | 使用 `pnpm-lock.yaml`；不恢复已停用的 Android 工具链                                                             |
| 大型依赖/缓存 | F 盘      | 项目在 F 盘；pnpm store、Playwright 浏览器缓存、Next 缓存均放 F 盘                                               |

Node 24.21.0 满足主候选声明的 `^24.15.0 || >=26.0.0`，但这是**清单推断**；A0 仍须实际执行版本命令确认。

### 2.3 目标脚本

A0 建立并保持以下命令可用（实际脚本以创建时的 Next.js 版本为准，不机械保留不存在的命令）：

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:browser   # Playwright，E 阶段必须实际执行
```

规则测试应能单独运行：

```bash
pnpm test -- tests/rules
```

### 2.4 建议目录

```text
docs/
  specs/                       # A0 逐字导入的规范与交接文档
  plans/implementation-plan.md # 本文件
  progress.md                  # 每轮追加实际状态与证据
src/
  app/                         # Next.js App Router 页面与 route handlers
  components/                  # 牌桌、动作输入、Key 设置、公开解读
  shared/contracts/            # DTO、错误码、动作/金额类型（客户端可引用）
  server/
    engine/                    # 规则引擎适配器、金额契约、牌型/结算适配
    session/                   # owner、版本、过期、幂等、PendingDecision
    bot-strategy/              # 无 Key 基础策略、牌风配置
    decision-service/          # 机器人视图、模型输出校验、提交
    deepseek-proxy/            # 固定上游、每请求凭据、超时/错误分类
    public-insight/            # 公开快照与模板
tests/
  rules/                       # 固定牌序的规则测试
  session/                     # 会话、并发、幂等、epoch
  api/                         # route handler / 契约 / 归属
  decision/                    # 模型替身、校验、回退
  browser/                     # Playwright
```

服务端模块通过 `import "server-only"` 或等价边界隔离；客户端只导入 `shared/contracts`，不得导入 `server/engine` 的完整状态类型。

---

## 3. 目标架构与核心接口

### 3.1 模块职责

- **game-engine**：完整规则状态、发牌、合法动作、下注轮、边池、退款、摊牌、结算。纯领域逻辑，不依赖 Next.js。
- **session**：`ownerId`、`gameId`、`stateVersion`、`aiEpoch`、模式、过期、每桌互斥、`requestId` 幂等、`PendingDecision`、配额。
- **bot-strategy**：无 Key 的可玩基础策略、四种牌风配置、合法动作内的确定性选择、降级策略。
- **decision-service**：构造单个机器人视图、调用代理、校验 JSON、检查 epoch/版本、原子提交、来源标记。
- **deepseek-proxy**：固定 `https://api.deepseek.com`；每次请求独立客户端/凭据；超时、错误分类、脱敏。
- **public-insight**：只接收 `PublicInsightView` 与已提交 `ActionEvent`；首版模板生成，不调用模型。
- **components**：牌桌、下注输入、Key 设置、连接/降级状态、公开解读面板。

### 3.2 核心领域类型

```ts
type SeatId = 0 | 1 | 2 | 3 | 4;
type PlayerId = "human" | "ai-1" | "ai-2" | "ai-3" | "ai-4";
type ActionName = "fold" | "check" | "call" | "bet" | "raise" | "all_in";
type ActionSource = "deepseek" | "local_no_key" | "local_fallback" | "forced";

interface ActionInput {
  action: ActionName;
  amountTo: number | null; // 仅 bet/raise 使用；其他必须 null
}

interface LegalActionView {
  actions: ActionName[];
  toCall: number;
  minBetTo: number | null;
  minRaiseTo: number | null;
  maxTo: number | null; // 当前轮可投入到的最大累计额
  canOnlyShortAllIn: boolean; // 只能以不足额全下超出当前下注额
}
```

约定：

- `fold/check/call/all_in` 的 `amountTo` 必须为 `null`；`bet/raise` 必须为正整数。
- 实际扣款 = `amountTo - 本轮已投入`；不得为负。
- `all_in` 由引擎计算最终累计额及其规则性质；不能一律视为重新开放加注。
- `call` 由服务端按 `min(toCall, remainingStack)` 计算，不允许客户端指定金额。
- 普通 `bet/raise` 与短全下分别校验；非法金额返回错误，不夹到最近边界。

### 3.3 规则引擎端口

适配层必须把第三方库的 API 收敛到以下接口，业务层不直接依赖库对象：

```ts
interface RuleEnginePort {
  createTable(config: TableConfig): EngineState;
  startHand(state: EngineState, options?: { deck?: string[] }): EngineState;
  applyAction(state: EngineState, seat: SeatId, action: ActionInput): EngineState;
  legalActions(state: EngineState, seat: SeatId): LegalActionView;
  publicView(state: EngineState, viewer: PlayerId | null): PublicStateView;
  botView(state: EngineState, bot: PlayerId): BotDecisionView;
  settle(state: EngineState): SettledState;
  nextHand(state: EngineState, topUp: TopUpDecision): EngineState;
  assertChipConservation(state: EngineState): void;
}
```

适配层负责：

- 库的 `BET/RAISE amount`（目标累计额）与 `amountTo` 的映射；`ALL_IN` 映射为库的 `RAISE`（目标为已投入 + 剩余筹码）或 `CALL`。
- 库错误码 → 本方 `INVALID_ACTION`/`NOT_YOUR_TURN`/`STALE_STATE` 等稳定错误码。
- 库状态 → 白名单 DTO；绝不返回 `deck`、对手底牌、`previousStates`、内部 reason。
- 库的座位/按钮/牌序测试钩子；测试辅助代码不得进入生产路径。
- 引擎没有的能力（手间补码、会话、版本、pending）由 session 层补充，不能伪装成库能力。

### 3.4 会话状态

```ts
interface GameSession {
  gameId: string;
  ownerId: string;
  createdAt: number;
  lastSeenAt: number;
  stateVersion: number;
  aiEpoch: number;
  aiMode: "disabled" | "enabled";
  engine: EngineState;
  handId: string;
  turnId: string;
  pendingDecision: PendingDecision | null;
  requestLedger: Map<string, IdempotentResult>;
  stats: {
    requests: number;
    successes: number;
    fallbacks: number;
    promptTokens: number;
    completionTokens: number;
    usageUnknown: boolean;
  };
}

interface PendingDecision {
  decisionId: string;
  actorId: PlayerId;
  handId: string;
  turnId: string;
  expectedVersion: number;
  aiEpoch: number;
  startedAt: number;
  deadlineAt: number;
  requestFingerprint: string;
}
```

- `stateVersion`：每次成功改变牌局或模式的操作递增；所有写请求带 `expectedVersion`。
- `turnId`：每个行动者的每个决策节点唯一；动作提交后推进。
- `aiEpoch`：`enable/disable/rotate` 均推进（至少 `disable/rotate` 必须推进）；旧 epoch 的结果一律不能提交。
- `requestId`：同一会话内幂等；相同 ID 不同内容拒绝。
- 单桌写操作在短临界区串行；远程模型等待不持有阻止停用的长锁。

### 3.5 HTTP 契约

所有响应 `Cache-Control: no-store`；写接口校验 Cookie 所属 `ownerId`、同源/CSRF。

| 接口                          | 请求要点                                                                 | 响应                                 |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------ |
| `POST /api/game/start`        | `requestId`；可选 `restart`                                              | `gameId`、可见初始状态               |
| `GET /api/game/state?gameId=` | 仅 owner                                                                 | 可见状态、版本、行动者、pending 摘要 |
| `POST /api/game/action`       | `gameId, handId, turnId, expectedVersion, requestId, action, amountTo`   | 已提交动作 + 最新状态                |
| `POST /api/game/next`         | 仅 settled；版本/requestId；真人为零时 `rebuy: true`                     | 补码事件 + 新一手                    |
| `POST /api/ai/test`           | 专用 Key 请求头、`requestId`；限频                                       | 可用性分类、usage（若有）            |
| `POST /api/ai/mode`           | `gameId, expectedVersion, requestId, operation: enable\|disable\|rotate` | 新 `aiEpoch`、模式                   |
| `POST /api/ai/decision`       | 当前回合四元组 + `requestId` + `aiEpoch`；按需带 Key                     | 已提交结果 / pending / stale / 错误  |
| `GET /api/ai/insight`         | `gameId, handId, actionEventId`；仅 owner                                | 绑定动作的公开说明                   |

统一业务错误至少包含：`SESSION_EXPIRED`、`NOT_YOUR_TURN`、`STALE_STATE`、`DECISION_PENDING`、`INVALID_ACTION`、`KEY_INVALID`、`INSUFFICIENT_BALANCE`、`RATE_LIMITED`、`UPSTREAM_UNAVAILABLE`。冲突返回最新可见状态，不自动重试所有错误。

### 3.6 Key 与上游

- Key 只通过专门请求头（建议 `x-deepseek-api-key`）进入 `test`/`decision` 请求；不放 body、URL、Cookie、Session。
- 上游固定 `https://api.deepseek.com`；模型名集中配置。
- 每请求创建独立客户端/凭据，请求结束释放引用；不共享可被覆盖的 `apiKey` 字段。
- 禁用请求/响应缓存；日志、异常、追踪、错误上报均脱敏；提示词与原始响应不进公开日志。
- 真实模型参数、思考模式关闭字段、JSON 模式细节在 D0 重新核对官方文档；**本计划不猜写未确认的字段名**。

### 3.7 信息视图

| 视图                | 包含                                                              | 明确排除                                |
| ------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| 完整引擎状态        | 全部牌、牌堆、内部结算                                            | 只允许服务端领域层                      |
| `PublicStateView`   | 自己的底牌、公共牌、公开动作、筹码、允许公开的摊牌                | 对手未公开底牌、牌堆、内部 reason       |
| `BotDecisionView`   | 该 bot 底牌、公开信息、自身牌风、合法动作、公开行动历史、边池资格 | 其他玩家底牌、其他 bot 私有推断、牌堆   |
| `PublicInsightView` | 动作发生时的公共牌、公开投入、位置、执行动作、actionEventId       | 所有未公开底牌、私有 reason、模型置信度 |

DTO 用显式字段映射，禁止 `{...state}` 后删字段。

---

## 4. 规则引擎候选核查（A1 的技术前置）

### 4.1 先区分两类库

- **完整下注引擎**：维护手牌/街道/行动顺序/盲注/最小加注/全下/边池/退款/摊牌/结算，能直接支撑一桌牌。
- **牌型比较库**：只接收 5—7 张牌，返回牌型与比较结果；不维护下注轮、筹码、底池、行动权或会话。

只有前者可以作为阶段 A 的“引擎候选”。牌型比较库可以被完整引擎依赖，或作为独立对照，但不能因为能判断“同花顺大于四条”就声称支持一桌无限注扑克。

### 4.2 候选一：`@pokertools/engine`

| 项        | 核查结果                                                                                   |
| --------- | ------------------------------------------------------------------------------------------ |
| 版本      | `2.1.0`（npm registry `latest`，本轮查询）                                                 |
| 许可证    | MIT（包元数据与仓库 LICENSE）                                                              |
| 运行环境  | Node `^24.15.0 \|\| >=26.0.0`；本地清单 Node 24.21.0 理论满足                              |
| 类型      | **完整无限注德州下注引擎**，不是单纯牌型库                                                 |
| 公开入口  | `PokerEngine`、`ActionType`、`createPublicView`、`createSnapshot`/`restoreFromSnapshot` 等 |
| 座位      | `maxPlayers` 校验范围 2—10；5 个座位在配置层允许                                           |
| 金额语义  | README 明确 `BET.amount`/`RAISE.amount` 为当前街的**累计目标额**；`CALL` 不带金额          |
| 边池/退款 | 源码有 `calculateSidePots`、`calculateUncalledBet`、`returnUncalledBet`；结算按池资格      |
| 零头      | 源码按按钮左侧起顺时针排序分配余数                                                         |
| 牌型      | 依赖 `@pokertools/evaluator`，摊牌枚举最佳五张                                             |
| 随机源    | 默认 Node `crypto`，无安全源时失败关闭；可注入 `randomProvider`                            |
| 信息隔离  | `createPublicView` 清空 `deck`、`previousStates`，只展示自己/已亮牌                        |
| 已知边界  | 首手按钮、固定牌序、合法动作 DTO 需要适配层补齐；需实测                                    |

**源码阅读后可确认的事实**：

- `validateConfig` 允许 `maxPlayers` 2—10，因此 5 座配置不会被直接拒绝；但未看到 5 座专项测试，不能把“允许配置”当成“5 座已验证”。
- `handleRaise` 用 `raiseIncrement >= lastRaiseAmount` 判断是否重新开放；源码逻辑与 G02/G03 方向一致，但**未执行测试**。
- `handleBet` 把下注额作为累计目标额；`gameReducer` 在下注已存在时把 `BET` 自动转成 `RAISE` 或 `CALL`。
- `calculateSidePots` 用累计投入的递增层级构造主池/边池；弃牌者筹码留在池内但失去资格。
- 首手 `deal()` 在 `buttonSeat === null` 时选择第一个已占座位，**不是随机按钮**；这需要适配层通过公开 `restore`/快照设置初始按钮，或另行处理。
- `deal()` 总是重新 `shuffle(createDeck(), randomProvider)`；没有直接传入固定牌堆的公开参数。固定牌序只能通过脚本化 RNG 控制发牌；公开快照恢复不能替代 `deal()` 的牌序注入。脚本化 RNG 的稳定性和快照设置按钮都必须实测。
- 没有 `legalActions/toCall/minBetTo/minRaiseTo/maxTo` 的整体查询接口；适配层需要从状态、当前下注、`minRaise`、`lastRaiseAmount`、行动历史推导。推导正确性是 A1 的关键实测项。
- 没有 `turnId`、`stateVersion`、`PendingDecision`、手间补码；这些明确属于 session 层，不要求库提供。

**必须实测的缺口（未通过前不得采用）**：

1. 5 座配置能完整发牌、行动、结算，且位置/盲注正确。
2. G01—G05、G08、G09、G11 的真实数值断言，尤其是短全下重新开放加注和未跟注退款。
3. 适配层推导的合法动作边界与实际 `validate` 一致；不存在“界面允许、引擎拒绝”或反向情况。
4. 固定牌序可控，且不修改库源码；测试辅助代码不进入生产路径。
5. 首手按钮可随机化且不影响固定座位/位置。
6. 公开视图不夹带牌堆、对手底牌或 `previousStates`。
7. 与 Next.js/Node 24 的实际安装、构建、运行无冲突。

### 4.3 候选二：`poker-engine-ts`

| 项        | 核查结果                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 版本      | `0.1.3`（npm registry `latest`，本轮查询）                                                                                              |
| 许可证    | MIT                                                                                                                                     |
| 运行环境  | Node `>=18`；核心运行依赖 `@noble/hashes`，可选 React/Supabase peers                                                                    |
| 类型      | **完整事件溯源无限注/底池限注/固定限注引擎**，不是单纯牌型库                                                                            |
| 座位      | 类型定义 `maxSeats: 2 \| 6 \| 9`；README 明确当前支持 2/6/9 座                                                                          |
| 公开能力  | `SessionManager`、`bootstrapSession`、`applyIntent`、`selectDecisionContext`、`selectTableView`；支持显式 `deck`、`buttonIndex`、`seed` |
| 金额语义  | `bet.amount` 是投入增量；`raise` 可带 `to` 目标；与统一 `amountTo` 需要适配                                                             |
| 边池/零头 | 源码有 `PotLedger`/`settlePots`，余数按按钮左侧起顺时针分配；有 property tests 与 short-all-in 测试文件，但**未执行**                   |
| 信息隔离  | `selectTableView`/decision context 是独立视图；仍需核对其实际字段                                                                       |
| 已知边界  | **5 座不在类型允许范围**；0.1.x 版本，生产成熟度需自行承担                                                                              |

**结论**：它的测试钩子（固定牌堆、按钮）和合法动作 API 很适合本项目，但 `maxSeats` 只允许 2/6/9。若用 6 座 + 1 个空座，会改变产品“固定 5 座”的数据模型、位置展示与测试假设；若打补丁改类型/逻辑，则变成维护 fork。除非主候选失败且用户明确接受 6 座空位或 fork，否则不采用。

### 4.4 牌型比较库（不作为完整引擎候选）

| 库                      | 版本/许可    | 能力                            | 结论                                                      |
| ----------------------- | ------------ | ------------------------------- | --------------------------------------------------------- |
| `@pokertools/evaluator` | `2.1.0`，MIT | 被主候选用于 5—7 张牌评估与比较 | 随主引擎使用；不单独承担下注                              |
| `pokersolver`           | `2.1.4`，MIT | 独立 5—7 张牌求解/比较          | **只做牌型比较**；可作为 G09 的独立对照，不能作为牌桌引擎 |
| `poker-evaluator`       | `2.1.1`，ISC | 3/5/6/7 张牌评估                | **只做牌型比较**；本轮不选，避免额外大依赖                |

本项目不会把“牌型库 + 自己写的若干下注函数”直接宣称为完整引擎；如果主候选被否，fallback 是“自建下注状态机 + 独立牌型库”，这会被视为范围更大的方案，需要重新评估并得到确认。

### 4.5 资料来源与核查边界

本轮查询/阅读的资料：

- `@pokertools/engine`：npm `latest` 元数据 <https://registry.npmjs.org/@pokertools%2Fengine/latest>；包 README 与源码 <https://github.com/aaurelions/pokertools/tree/main/packages/engine>；npm 页面 <https://www.npmjs.com/package/@pokertools/engine>。
- `poker-engine-ts`：npm `latest` 元数据 <https://registry.npmjs.org/poker-engine-ts/latest>；README/源码 <https://github.com/Ge-limin/poker-engine-ts>；npm 页面 <https://www.npmjs.com/package/poker-engine-ts>。
- `pokersolver`：npm 元数据 <https://registry.npmjs.org/pokersolver/latest>；仓库 <https://github.com/goldfire/pokersolver>。
- `poker-evaluator`：npm 元数据 <https://registry.npmjs.org/poker-evaluator/latest>；仓库 <https://github.com/Sukhmai/poker-evaluator>。
- DeepSeek 官方文档（D0 重新核对）：JSON Output <https://api-docs.deepseek.com/guides/json_mode/>；思考模式 <https://api-docs.deepseek.com/guides/thinking_mode/>；模型/价格 <https://api-docs.deepseek.com/quick_start/pricing/>。

边界：以上是公开资料/源码核查与 `latest` 版本查询，**不是**本地安装、运行或集成测试结果；README 中的测试数量、性能描述和“production-ready”措辞不构成本项目验收证据。

### 4.6 A1 采用门槛

**主候选 `@pokertools/engine@2.1.0`**。在 A1 中只安装它以做最小实测；不安装候选二，先以静态审查记录其 5 座限制。

进入 A2 的条件：

- G01、G02、G03、G04、G05、G06、G07、G08、G09、G11 的测试全部实际通过。
- 5 座发牌与位置实际走通。
- 合法动作推导与引擎 `validate` 在正常/短全下/全下边界一致。
- 固定牌序与首手按钮测试钩子可用，且不修改库源码。
- 公开视图无泄漏。
- `pnpm typecheck`、`pnpm lint`、`pnpm build` 通过。

任一硬条件失败：停止 A2，记录失败命令与最小复现；在“候选二（需接受 6 座或 fork）”与“自建引擎”之间做一次明确选择，不能静默降级。

---

## 5. 阶段 A：规则引擎与契约

### 5.1 依赖

- A0 工具链与环境门禁。
- 规范/交接文档已导入项目。
- 主候选安装成功。

> 执行偏差（2026-10-22）：Stage A 实际建立的是 TypeScript + Vitest 领域包，`pnpm build` 用 `tsc`；Next.js 页面外壳、Tailwind 和浏览器验收顺延到 Stage B。理由是 Stage A 的验收对象是规则/契约，不是 UI；此偏差不改变 Stage B 的交付范围。详见 `docs/progress.md` 与 `docs/plans/rule-engine-assessment.md`。

### 5.2 产物

1. 可独立运行的 `src/server/engine` 适配器、领域状态、`action + amountTo` 契约、合法动作查询。
2. 固定牌序测试入口；生产随机源边界（服务端安全随机，测试可注入，客户端不可提供牌序/种子）。
3. G01—G09、G11 的可运行测试，覆盖短全下、加注权、主池/边池、未跟注退款、零头、牌型比较。
4. 规则库能力/缺口记录：实际安装版本、官方资料、已确认能力、实测结果、未满足项。
5. 公开/机器人视图 DTO 的最小映射与泄漏测试。

### 5.3 拆分任务

- **A0 环境与脚手架**
  - 初始化 Git；创建 Next.js + TypeScript + Tailwind 项目；Vitest/ESLint/Prettier；锁文件。
  - 导入规范；创建 `docs/progress.md` 并保持更新。
  - 验证 `pnpm install --frozen-lockfile`、`pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build`。
  - 记录 Node/pnpm 实际版本。若命令仍不可用，A0 失败，不进入 A1。
- **A1 规则 spike**
  - 安装 `@pokertools/engine@2.1.0`（显式安装 `@pokertools/types@2.1.0`、`@pokertools/evaluator@2.1.0`，避免 peer 缺失）。
  - 写 `tests/rules/fixed-deck.ts`：用脚本化 `randomProvider` 反推 Fisher-Yates 抽样，生成固定牌序；尝试用公开 `restore` + 快照字段设置首手按钮；只使用公开 API，若 `restore` 不接受该前置状态则记录失败，不修改库源码。
  - 以 5 座、1,000 筹码、5/10 盲注构建表；逐条实现 G 测试。
  - 证据：命令、测试名、断言数值、失败日志；不以 README 声称代替运行。
- **A2 适配与契约**
  - `EngineState`/`PublicStateView`/`BotDecisionView` 类型；显式映射。
  - `ActionInput` → 库动作；`ALL_IN` 性质计算；错误码映射。
  - `LegalActionView` 推导；与库 `validate` 对照测试。
  - 金额安全整数校验；`amountTo` 不能为负/非整数/超过安全范围。
  - 公共牌/底池/行动记录 DTO。
- **A3 视图与审计**
  - 真人视图/机器人视图/公开解读视图三类构造器。
  - 禁止完整状态序列化；测试 `deck`、对手底牌、`previousStates`、私有摘要不存在。
  - `ActionEvent` 最小字段与 `actionEventId`；为 E 的公开解读留出 `publicContext`。
- **A4 规则能力报告**
  - `docs/plans/rule-engine-assessment.md`（或并入本文件）记录：库版本、许可证、已覆盖、适配层补充、未满足、测试结果。
  - 结论只能是“采用/不采用/有条件采用”；不把未运行项写成通过。

### 5.4 验收编号

- **G01、G02、G03、G04、G05、G06、G07、G08、G09、G11**。
- 阶段门禁：`A-GATE-01`（全部 G 测试通过 + typecheck/lint/build + 无信息泄漏）。
- 不计入官方 23 项、但必须有的内部检查：固定牌序可重复、5 座位置正确、金额不夹取、适配层与引擎合法动作一致。

### 5.5 退出条件

- 规则模块可以在没有 UI、没有 Key、没有网络的情况下独立运行。
- 所有断言是具体数值/资格/行动者，不是“存在一个同名测试”。
- 未通过的规则不得带入 B。

---

## 6. 阶段 B：无 Key 可玩的五人桌

### 6.1 依赖

- A-GATE-01 通过。
- 单进程内存会话方案确认。
- Playwright/浏览器可用（至少手工浏览器走查；E 阶段必须自动化或等价实测）。

> 执行记录（2026-10-22）：Stage B 已完成并实际走通 3 手、提前弃牌、刷新恢复和确定性补码场景。实现使用 Next.js 16 + 浏览器本地机器人；`POKER_STAGE_B_TEST_TABLE=1` 是仅开发/测试使用的确定性补码 fixture，生产默认仍使用安全随机表。详见 `docs/plans/stage-b-report.md`。

### 6.2 产物

1. 创建牌桌、玩家可见状态、真人动作、结算、下一手接口。
2. 五固定座位、公共牌、行动记录、合法金额输入、筹码/底池展示。
3. 四名基础策略机器人；浏览器按回合推进；`/api/ai/decision` 的本地策略基础路径。
4. 匿名会话归属、单进程内存会话、空闲过期、刷新恢复边界。
5. 手间补码；真人弃牌后电脑继续完成本手。
6. 匿名 Cookie、CSRF/同源校验、`no-store`、基本限频。

### 6.3 拆分任务

- **B1 领域与会话**
  - `GameSession`、`ownerId`、`stateVersion`、`turnId`、过期、每桌互斥。
  - 固定 5 座；首手按钮随机（用服务端随机源），后续顺时针移动。
  - 手间 top-up：正在进行的一手内禁止；结算后零筹码 bot 自动补至 1,000；真人零筹码需显式 `rebuy: true`；补码作为独立事件。
  - 真人弃牌后仍继续推进 bot，直到本手结束。
- **B2 API 与 UI**
  - 四个 game 接口；白名单 DTO；错误码；同源/CSRF；Cookie。
  - 牌桌组件：座位、按钮/盲注、公共牌、底池/边池、行动记录、合法动作、金额输入、确认、下一手。
  - 金额输入按 `minBetTo/minRaiseTo/maxTo` 校验；短全下单独呈现；不自动夹取。
  - 结算页：赢家、牌型、各池金额；真人零筹码时“补充 1,000 并继续”。
- **B3 基础机器人**
  - 四个固定牌风：紧弱、松凶、均衡、当前手观察适应。
  - 仅使用 `BotDecisionView` 和合法动作；决策确定性，不使用 `Math.random` 冒充智能。
  - 本地基础路径与后续 DeepSeek 路径共用同一提交接口；动作来源先标 `local_no_key`。
  - 浏览器按“当前行动者”串行触发；同一回合不重复请求。
- **B4 稳定性**
  - 刷新先 `GET /api/game/state`；不依赖客户端内存恢复。
  - 空闲过期；单进程重启/内存丢失返回 `SESSION_EXPIRED`；提示重新开桌。
  - 同一用户多标签：版本冲突 + 幂等，不重复推进。
  - 日志脱敏、请求大小限制、基础频率限制。

### 6.4 接口

`/api/game/start`、`/api/game/state`、`/api/game/action`、`/api/game/next`；本地 `/api/ai/decision` 路径。所有 game 接口做 owner 校验；`start` 创建 Cookie。

### 6.5 验收编号

- **G10**：结算后两个座位为零，仅手间补码，下一手仍五人，补码不计上手收益。
- **V03**：机器人弃牌后的网络响应不含未公开底牌、牌堆、私有摘要。
- **S02**：有效会话刷新恢复；过期/服务端重启明确提示重新开桌。
- **S01（本阶段部分）**：伪造 `gameId` 访问 state/action/next 被拒绝；C/D/E 继续扩展到新接口。
- 浏览器实测：连续至少 3 手、真人提前弃牌、输光补码、刷新恢复。
- 阶段门禁：`B-GATE-01`（上述通过 + 无 Key 可完整游玩 + 筹码守恒 + build）。

### 6.6 退出条件

- 无 Key 也能从开桌玩到结算并进入下一手。
- 筹码守恒可被测试/审计事件解释。
- 刷新不会把客户端状态当权威；重启边界有明确提示。

---

## 7. 阶段 C：BYOK、模式与机器人回合调度

### 7.1 依赖

- B-GATE-01 通过。
- 可控上游替身（延迟/失败/并发）可用；不依赖真实 Key。
- 同源/CSRF/Cookie 已落地。

### 7.2 产物

1. `sessionStorage` 临时 Key 设置、用户主动“保存并测试”、清除、状态提示。
2. 固定 DeepSeek 上游地址的请求适配层；Key 仅请求作用域。
3. `decision`/`mode` 接口：`enable`、`disable`、`rotate`、`aiEpoch`。
4. `requestId`、`handId`、`turnId`、`stateVersion`、`PendingDecision`、截止时间、原子提交。
5. 刷新先同步；清除/更换使旧响应失效；同一回合重复触发不新建额外逻辑流程。
6. 调用次数/成功/降级/usage 统计（缺失标“未确认”）。

### 7.3 关键规则

- **Key 存储**：只存 `sessionStorage`；浏览器禁止时退化为页面内存并提示刷新需重填；清除覆盖存储、组件状态、输入框、待重试引用。
- **Key 传输**：只走专门请求头；`test`/`decision` 按需携带；不进 body/URL/Cookie/Session/日志/缓存。
- **模式**：
  - `enable`：从 disabled 进入 enabled；推进 epoch（至少保证旧结果失效）。
  - `disable`：提升 epoch，停止新调度；在途结果不能提交。
  - `rotate`：即使仍 enabled 也提升 epoch；不传 Key；服务端只记录模式与 epoch。
- **Pending**：同桌同回合至多一个逻辑决策流程；远程等待不持有长锁；超时/取消按 `decisionId` 释放；旧响应不能清掉新预留。
- **幂等**：同 `requestId` 同内容返回原状态/结果；同 ID 不同内容拒绝；换 requestId 的重复触发仍不能创建第二个逻辑流程。
- **刷新**：先读服务器状态；有 pending 则等待结果或截止，不直接重新付费调用。
- **清除/更换**：本地立即清除并停止调度，再调用 mode；若断网显示“本地已清除，服务端停用尚未确认”；恢复后以新 requestId 完成停用/换代，不静默恢复 AI。
- **无 Key 但服务端仍 enabled**：先停用并同步，再运行本地基础策略。
- **上游取消**：`AbortController` 只是客户端取消，不承诺供应商停止计费；不写“零费用”。

### 7.4 验收编号

- **A03**：同一回合重复点击/两个标签同时触发，只创建一个有效逻辑流程，最多提交一个动作；流程内重试单独计数。
- **A04**：旧响应晚于换 Key/停用/重开确认，旧 epoch 或旧手结果丢弃，不修改当前牌局。
- **K01**：两个匿名用户用不同测试标记 Key，各自请求只使用自己的标记；无共享客户端串用、无日志泄露。
- **K03**：决策在途时清除 Key，本地立即清除；服务端确认后旧结果不能提交；不承诺已发送调用零费用。
- **S01（扩展）**：state/action/decision/mode 全部 owner 校验；insight 的 owner/actionEventId 校验在 E 阶段补齐。
- 强制场景：清除 Key 时在途响应、停用版本冲突、同状态换 Key 仍推进 epoch、旧请求不能释放新 decisionId 预留。
- 阶段门禁：`C-GATE-01`（上述通过 + 两个用户隔离 + 无真实付费调用）。

### 7.5 接口

| 接口                    | 本阶段职责                                                                                            |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `POST /api/ai/test`     | 用户主动触发；接收本请求 Key；返回可用性分类与 usage（若有）；不返回 Key                              |
| `POST /api/ai/mode`     | `enable/disable/rotate`；接收 `gameId/expectedVersion/requestId`；不接收 Key；返回新 `aiEpoch` 与模式 |
| `POST /api/ai/decision` | 接收当前回合四元组 + `requestId` + `aiEpoch`，按需携带 Key；返回 committed/pending/stale/错误         |
| `GET /api/game/state`   | 刷新同步；返回 `pendingDecision` 摘要（不返回 Key/私有 reason）                                       |

以上接口全部校验 `ownerId`；`decision` 和 `test` 的 Key 只走专门请求头。

### 7.6 真实 API 边界

- C 阶段只做可控替身测试；真实适配可以写，但不因测试擅自调用付费服务。
- 报告区分“模拟验证”和“真实联调”；没有 Key/未联调时明确写“真实 API 未验证”。

---

## 8. 阶段 D：四名 DeepSeek 对手实际决策

### 8.1 依赖

- C-GATE-01 通过。
- D0 重新核对官方 DeepSeek 文档：模型名、JSON Output、思考模式关闭字段、错误码、usage 字段；不沿用未核实的猜测。
- 用户明确小额真实联调范围（如进行）；否则只做替身测试。

### 8.2 产物

1. 每名机器人独立的信息视图、牌风配置、当前手公开行动历史。
2. 明确的非思考模式、输出预算、节点超时、有限重试。
3. JSON 结构校验、金额/合法动作校验、错误分类、本地降级。
4. 实际动作来源标记；请求次数/usage 统计；缺失用量标“未确认”。
5. 服务端根据已执行动作更新状态，后一个机器人依据新状态继续决策。
6. 四个机器人分别用可控结果证明“实际动作随模型返回改变”。

### 8.3 决策参数（产品默认，待实测调优）

- 模型：`deepseek-flash`，集中配置。
- 上游：`https://api.deepseek.com`，固定，不允许客户端改目的地。
- 单次输出上限：800 tokens 起步。
- 单节点总等待预算：12 秒起步。
- 非思考模式：D0 按官方文档显式设置；具体字段不在本计划中猜写。
- 不请求联网、工具调用或整场最优策略。
- 400/401/402 不重试；429/暂时性服务错误最多重试一次，且受总预算约束。
- 只有“有 Key + enabled + 需要机器人选择”的行动节点调用；已弃牌/全下/自动发牌/自动结算不调用。

### 8.4 输出协议与校验

```json
{
  "action": "raise",
  "amountTo": 100,
  "opponentIntents": [
    { "targetPlayerId": "human", "hypothesis": "简短公开推断", "confidenceLabel": "low" }
  ],
  "decisionSummary": "私有简短摘要",
  "confidenceLabel": "medium"
}
```

校验：

- `action` 必须是当前 `legalActions` 之一；行动者由服务端当前回合绑定，模型不得指定。
- `amountTo`：`bet/raise` 为正整数且在 `minBetTo/minRaiseTo/maxTo` 内；其他动作为 `null`；不自动改写/夹取。
- `opponentIntents`：最多 4 个；`targetPlayerId` 必须是合法其他玩家；`hypothesis`/`decisionSummary` 长度受限；`confidenceLabel` 只接受枚举。
- 空内容、截断、JSON 解析失败、字段缺失/多余、非法金额、非法动作都走明确失败路径。
- 失败默认本地降级：合法过牌优先，否则弃牌；不凭空生成跟注/加注。降级原因与来源可见。
- 私有摘要/意图只用于当前请求范围；不进入公开状态或普通日志。

### 8.5 接口

D 阶段不新增公开业务接口，复用 C 的 `/api/ai/decision` 与 `/api/ai/mode`，但补齐以下语义：

- `decision` 请求必须带 `gameId/handId/turnId/expectedVersion/requestId/aiEpoch`；Key 只走请求头。
- 返回 `status: "committed" | "pending" | "stale" | "error"`、`source`（`deepseek`/`local_fallback`/`forced`/`local_no_key`）、已提交动作（若有）、最新可见状态与稳定的业务错误码。
- 模型原始输出、私有摘要、上游错误体不进入公开响应或普通日志；只保留脱敏后的错误分类与 usage。
- `test` 仍由用户主动触发；不在页面渲染、刷新或自动决策时隐式测试连接。
- 若同回合已有 pending，重复 decision 请求返回 pending/既有结果，不新建上游调用。

### 8.6 测试

- **A01**：四个 seat 分别注入至少两种不同合法模型结果；每个 seat 的实际动作随之改变，来源记录 `deepseek`；不能只多一段解释。
- **A02**：非法金额、错误动作、空 JSON、截断、Key 错误、超时；不执行非法建议；按约定回退/提示并解除 pending。
- **V01**：固定机器人自有牌和公开信息，替换其他玩家隐藏牌与牌堆，该机器人模型输入不变。
- 回归 C 的在途/隔离/幂等测试。
- 上游替身应位于 HTTP 边界（如 MSW/undici MockAgent），而不是只 mock 内部函数。
- 真实联调只有在用户提供 Key 并明确范围后进行；报告请求次数、可用 usage、延迟、实际返回分类；未做则写“真实 API 未验证”。
- 阶段门禁：`D-GATE-01`（四 seat 可控结果 + A02 + V01 + C 回归 + 无真实 Key 泄露）。

### 8.7 退出条件

- 四名机器人不是“规则机器人 + 解释”，而是实际执行经过校验的模型动作。
- 任一失败路径都不会卡桌，来源/降级状态准确。

---

## 9. 阶段 E：公开解读、浏览器验收与交付

### 9.1 依赖

- D-GATE-01 通过。
- 23 项验收矩阵已有逐项记录。
- 可运行的单实例环境与浏览器。

### 9.2 产物

1. 思路入口与“基于公开信息的行动解读”说明，绑定已提交 `actionEventId`。
2. 只使用动作发生时公开视图的独立模板；不读取私有 reason；首版不额外调用模型。
3. 移动布局、下注操作、连接/降级状态检查。
4. `sessionStorage` 刷新、关闭重开、恢复关闭标签页的实测记录。
5. 单实例常驻部署说明、启动说明、Key/费用说明、当前限制。
6. 23 项验收矩阵的逐项状态、测试/人工步骤与证据。

### 9.3 公开解读规则

- 每个机器人显示本手最近一次已提交动作；未行动显示“暂无行动”；下一手清空。
- 解读绑定 `actionEventId`，显示街道和金额；使用动作发生时的公共牌/投入/位置快照，不用后续公共牌解释之前动作。
- 被拒绝、超时、取消的模型建议不产生已执行动作说明。
- 普通策略和 DeepSeek 策略共用同一公开解释边界。
- 面板固定说明：“基于公开信息的行动解读，不代表真实手牌或完整内部决策理由。”
- 模板输出示例：动作造成的公开效果 + 可能解释 + 公开信息不足以确定真实牌力；不出现“我在诈唬/我有价值牌”等私有判断。

### 9.4 接口

| 接口/契约                        | 本阶段职责                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `GET /api/ai/insight`            | 输入 `gameId/handId/actionEventId`；校验 owner 与动作存在；返回 `PublicInsight`；不触发模型              |
| `PublicInsight` DTO              | `actionEventId`、街道、动作、金额、动作时公开上下文摘要、模板文本、生成方式；不含底牌/私有 reason/置信度 |
| `TableStateView` 的 insight 关联 | 只暴露“最近一次已提交动作”的 insight 入口；未行动显示空状态；下一手清空                                  |

### 9.5 验收编号

- **V02**：固定公开状态与最终动作，替换机器人底牌和私有摘要，公开解读输入不变、模板输出不变、不泄露诈唬标签。
- **K02**：同标签刷新、正常关闭重开、恢复关闭标签页，实测并记录；与 sessionStorage 文案一致，不承诺必定为空。
- **S01（最终）**：补上 insight 的 owner 与 actionEventId 归属校验，并对其余全部接口做一次全量复核。
- 全矩阵 23 项：G01—G11、A01—A04、V01—V03、K01—K03、S01—S02。
- 阶段门禁：`E-GATE-01`（全部 23 项有状态/证据 + 自动检查 + 浏览器走查 + 部署说明）。

### 9.6 交付边界

- 交付可运行代码与本地启动方式；公开部署是单独后续操作，不用占位页面替代本地验收。
- 构建成功不等于规则、隐私、真实模型调用全部通过；报告中分别列明。

---

## 10. 验收矩阵与阶段映射

| 编号 | 场景摘要                                                   | 主阶段 | 测试/证据                                       |
| ---- | ---------------------------------------------------------- | ------ | ----------------------------------------------- |
| G01  | BB 已投 10，加注至 30 只再扣 20                            | A      | `tests/rules/g01-amount-to.test.ts`             |
| G02  | 30 → 45 短全下，C 最小加注至 65；无后续足额增量 A 不能加注 | A      | `g02-short-allin-no-reopen.test.ts`             |
| G03  | 30 → 45 → 50，累计完整增量 20，A 可加注至 70               | A      | `g03-cumulative-short-allin-reopen.test.ts`     |
| G04  | 主池 350、边池 400、C 未跟注 200 退回                      | A      | `g04-side-pots-uncalled.test.ts`                |
| G05  | A>B>C 分别得 350/400/200，总 950，D 不参与                 | A      | `g05-side-pot-payout.test.ts`                   |
| G06  | 翻前全员跟注，未全下 BB 仍可过牌/加注                      | A      | `g06-big-blind-option.test.ts`                  |
| G07  | 一人全下，其他两人仍可下注，不提前发完                     | A      | `g07-allin-continue-betting.test.ts`            |
| G08  | 弃牌结束 / 多人平局、各池资格、整数零头                    | A      | `g08-fold-win-and-tie-odd-chip.test.ts`         |
| G09  | A2345、踢脚、公共牌最佳，不按字符串/花色                   | A      | `g09-hand-ranking.test.ts`                      |
| G10  | 结算后两座位为零，仅手间补码，仍五人                       | B      | `tests/session/rebuy.test.ts` + 浏览器          |
| G11  | BB 仅 3 全下，UTG 跟注 10、最小加注 20；轮末不等 BB        | A      | `g11-short-bb-bringin.test.ts`                  |
| A01  | 四个机器人分别执行不同合法模型动作                         | D      | `tests/decision/model-seat-variation.test.ts`   |
| A02  | 非法金额/动作/空 JSON/截断/Key 错误/超时                   | D      | `tests/decision/invalid-output.test.ts`         |
| A03  | 重复点击/双标签只创建一个逻辑流程、最多一个动作            | C      | `tests/session/decision-idempotency.test.ts`    |
| A04  | 旧响应晚于换 Key/停用/重开确认被丢弃                       | C      | `tests/session/epoch-invalidation.test.ts`      |
| V01  | 替换他人隐藏牌/牌堆，机器人输入不变                        | D      | `tests/decision/privacy-invariance.test.ts`     |
| V02  | 替换机器人底牌/私有摘要，公开解读不变且不泄露              | E      | `tests/insight/public-only.test.ts`             |
| V03  | 弃牌机器人响应无底牌/牌堆/私有摘要                         | B      | `tests/security/public-view.test.ts`            |
| K01  | 两个匿名用户不同标记 Key 不串用、不泄露                    | C      | `tests/security/key-isolation.test.ts`          |
| K02  | 刷新/关闭重开/恢复标签页实测                               | E      | `tests/browser/storage.spec.ts`                 |
| K03  | 在途清除 Key，旧结果不能提交，不承诺零费用                 | C      | `tests/session/clear-key-inflight.test.ts`      |
| S01  | 伪造 gameId/actionEventId 被全部接口拒绝                   | B→C→E  | `tests/api/ownership*.test.ts`，逐阶段扩展      |
| S02  | 刷新恢复；过期/重启提示重开                                | B      | `tests/session/expiry-restart.test.ts` + 浏览器 |

> S01 不是一次性的：B 覆盖已有 game 接口，C 扩展到 decision/mode，D 扩展到模型相关接口，E 做最终全量核对。任何新接口必须同时补 owner 检查，不能留到最后。

---

## 11. 质量门禁与证据格式

### 11.1 每阶段固定检查

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:browser   # 涉及浏览器的阶段
```

### 11.2 每阶段汇报模板

- 当前阶段
- 实现内容（行为变化 + 文件）
- 规范覆盖（条款/验收编号）
- 验证结果（实际命令、通过/失败/未运行、输出摘要）
- 浏览器检查（实际走查步骤；未检查则明确）
- 真实 API（是否调用、次数、usage；未调用则说明）
- 已知问题（影响、是否阻挡下一阶段）
- 进度记录/提交（文件位置、Git 提交号）
- 下一步（只写紧接着的任务）

### 11.3 失败处理

- 保留失败测试；不删除、不跳过规则来“通过”。
- 只做最小必要修复；保留已通过功能。
- 不以“模型说测试通过”替代本地结果；不以构建成功替代规则/隐私/真实 API 验收。

---

## 12. 风险、阻塞与待确认事项

### 12.1 当前硬阻塞

1. **命令执行失败**：`pwsh` 启动即 `0xC0000142`；无法安装依赖、跑测试、初始化 Git、启动浏览器。修复或更换执行环境前，A0 不能完成。
2. **项目为空**：没有基线代码/package/Git；本计划按“从零搭建”假设编写。如果用户认为已有代码应存在，需要先核对磁盘/挂载/路径，不能覆盖。
3. **规范文件不在项目内**：A0 需要逐字导入并记录来源；本轮未复制，避免生成不一致副本。

### 12.2 规则引擎风险

4. **主候选测试钩子不足**：首手按钮非随机、无直接固定牌堆参数。适配层需要公开 `restore` + 脚本化 RNG；若无法稳定控制，A1 可能失败。
5. **合法动作 DTO 缺失**：需要从状态推导，存在与引擎内部校验不一致的风险；必须做对照测试。
6. **5 座未专项验证**：配置允许不等于已测试；A1 必须实际跑 5 座。
7. **备选 5 座类型限制**：`poker-engine-ts` 只支持 2/6/9；6 座空位/fork 都会改变产品模型，需用户明确批准。
8. **依赖版本新**：主候选 2.1.0、备选 0.1.3 都较新；必须以锁定版本和本地测试为准，不把 README 的测试数量当成本地通过。

### 12.3 产品/验收风险

9. **真实 DeepSeek 未验证**：本轮没有任何 API 调用；D 阶段需要在用户授权下小额联调。
10. **浏览器存储行为**：K02 必须在真实浏览器实测；不能用 Node 模拟 `sessionStorage` 代替。
11. **单进程内存**：部署必须单实例单进程；重启/发布丢会话是设计边界，不是 bug。
12. **Playwright/Chromium 安装**：需要 F 盘缓存与网络；若被环境阻塞，E 阶段不能声称浏览器验收通过。

### 12.4 需要用户确认的事项

- 是否确认 `F:\code\PokerAI` **应为空项目**，还是已有代码在别处/未挂载？
- 是否同意 A0 将两份附件逐字导入 `docs/specs/`，并以导入件作为项目内唯一规范源？
- 若主候选 A1 失败，是否接受“6 座空位/fork 备选”或“自建下注状态机”的范围变化？
- D/E 阶段是否提供真实 DeepSeek Key 并授权小额联调；额度/次数上限是多少？
- 部署目标是否保证 Node 24.15+ 的单实例常驻进程？

---

## 13. 下一步

1. 修复命令执行环境，实际运行 `node --version`、`pnpm --version`、`git --version`。
2. 在确认空项目后执行 A0：初始化仓库/Next.js/测试工具，导入规范，建立锁文件与脚本。
3. 执行 A1：安装 `@pokertools/engine@2.1.0`，先写固定牌序 5 座最小用例，再跑 G01—G05、G08、G09、G11。
4. 只有 A-GATE-01 通过，才开始 B 的牌桌与会话实现。

**本轮到此为止：未实现任何业务功能，未安装依赖，未运行测试，未调用真实 API。**
