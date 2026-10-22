# Stage B — 无 Key 可玩五人桌 交付记录

- 日期：2026-10-22
- 状态：**Stage B 规则/流程目标完成；Stage C 未开始**
- 运行时：Node.js 24.21.0、pnpm 11.7.0、Next.js 16.4.2
- 规则库：`@pokertools/engine@2.1.0`（沿用 Stage A）

> 本文件记录实际实现、命令、浏览器检查与证据。没有执行的真实 DeepSeek 调用、跨进程持久化、线上部署不计为已完成。

## 1. 已实现

### 1.1 页面与交互

- 单一牌桌页面：`src/app/page.tsx`
- 五个固定座位（`human`、`ai-1`—`ai-4`），按按钮位置动态显示 BTN/SB/BB/UTG/CO。
- 公共牌、底池、各玩家筹码/本轮投入/状态、自己的底牌、机器人背面牌。
- 行动面板：弃牌、过牌、跟注、下注/加注金额输入、全下。
- 行动记录、结算赢家与下一手按钮。
- 浏览器按顺序推进四个本地机器人；无 Key。
- 视觉证据：[桌面](../evidence/stage-b-table.png)、[移动端](../evidence/stage-b-mobile.png)。

### 1.2 API

| 接口                    | 行为                                                |
| ----------------------- | --------------------------------------------------- |
| `POST /api/game/start`  | 创建牌桌；HttpOnly 匿名 Cookie；可显式重开          |
| `GET /api/game/state`   | 仅 owner；返回白名单可见状态                        |
| `POST /api/game/action` | 真人动作；`action + amountTo`；版本/手牌/回合校验   |
| `POST /api/game/next`   | 仅结算后；机器人自动补码；真人零筹码需 `rebuy:true` |
| `POST /api/ai/decision` | 本地基础策略；按当前行动者推进；无 Key              |

所有响应 `Cache-Control: no-store`；所有牌局接口校验 Cookie `ownerId`；写接口做同源检查。

### 1.3 会话与安全边界

- `GameSessionStore`：单进程 `Map`，30 分钟空闲 TTL，最多 100 个会话。
- 匿名 Cookie：32 字节随机 token、HttpOnly、SameSite=Lax、生产 Secure；Cookie 最长 7 天，服务端会话仍按 30 分钟空闲过期。
- 单进程 `globalThis` 服务实例；进程重启/内存丢失后返回 `SESSION_NOT_FOUND`，页面提示重新开桌。
- `stateVersion`/`handId`/`turnId` 校验；`requestId` 幂等记录；同一请求不同内容拒绝。
- 开始牌桌可 `restart:true` 清理该 owner 的旧桌。
- 不保存 Key；Stage B 没有 Key 输入，也没有模型调用。

### 1.4 本地机器人

`src/server/bot-strategy/local.ts`：

- 四个牌风：紧弱、松凶、相对均衡、当前手观察适应。
- 仅通过 `BotDecisionView` 与 `legalActions` 决策；不读取其他玩家底牌/牌堆。
- 确定性策略，不使用 `Math.random` 代替智能。
- 结果统一走 `table.act`，服务端仍是唯一裁决方。
- 动作来源为 `local_no_key`。

### 1.5 手间补码

- `PokerTable.addChips` 写入 `pendingAddOn`，下一手发牌时合并。
- 下一手时：零筹码机器人自动补至 1,000；真人零筹码必须显式 `rebuy:true`。
- 补码事件写入 `topUps`，类型区分 `auto_bot` / `human_rebuy`。
- 本手内禁止补码；结算后、下一手前才允许。

## 2. 验证结果

### 2.1 自动测试

```text
pnpm test
Test Files  15 passed (15)
Tests       27 passed (27)
```

其中 Stage A 的 G01—G09/G11 与契约测试全部保留通过；新增：

- `tests/session/service.test.ts`：创建/恢复、owner 隔离、TTL、重启、本地机器人路径、G10。
- `tests/contracts/table-lifecycle.test.ts`：手内禁止补码/下一手、pendingAddOn 在下一手生效。

### 2.2 静态检查与构建

```text
pnpm typecheck  通过
pnpm lint       通过
pnpm format:check 通过
pnpm build      Next.js 16.4.2 生产构建通过
```

### 2.3 浏览器（Playwright + 系统 Chrome）

正常服务：

```text
pnpm test:browser
2 passed, 1 skipped
```

实际走通：

1. 连续 3 手。
2. 真人提前弃牌，机器人继续完成本手。
3. 刷新页面后仍是同一 `gameId`、同一手牌，恢复服务器状态。
4. 另一匿名 owner 对 state/action/next/decision 的访问均返回 404。
5. 网络状态不含 `deck`、`previousStates`、`decisionSummary`。
6. 停止 dev 进程并重启后，用原 Cookie/localStorage 刷新，页面显示“原牌桌会话已过期或服务端已重启”，不恢复旧局。

确定性补码场景（测试专用）：

```text
POKER_STAGE_B_TEST_TABLE=1 pnpm dev
POKER_TEST_REBUY=1 pnpm exec playwright test tests/browser/rebuy.spec.ts
1 passed
```

实际走通：真人 1 筹码全下 → 与另一名 1 筹码机器人一同输光 → 结算显示“补充 1,000 虚拟筹码并继续” → 点击后进入第 2 手，真人/机器人筹码恢复；补码提示与事件可见。

证据：[补码结算](../evidence/stage-b-rebuy.png)、[补码后的下一手](../evidence/stage-b-next-hand.png)、[重启后的过期提示](../evidence/stage-b-expired.png)。

## 3. 验收覆盖

| 编号         | 状态               | 证据                                                                                                       |
| ------------ | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| G10          | 通过               | 服务层真实引擎场景 + 确定性浏览器补码测试；两个零筹码座位，hand 2 仍五人                                   |
| V03          | 通过               | 公开视图测试 + 浏览器网络 DTO 检查；无 deck/previousStates/私有摘要                                        |
| S02          | 通过               | 浏览器刷新恢复；空闲过期/进程重启服务层测试；实际停进程→重启后刷新页面显示“原牌桌会话已过期或服务端已重启” |
| S01          | 通过（本阶段接口） | 独立 owner 对 state/action/next/decision 全部 404；insight 在 E 阶段补齐                                   |
| Stage A 回归 | 通过               | Stage A 13 个文件/21 个测试保留；Stage B 新增后合计 15 文件/27 测试全绿                                    |

## 4. 已知限制

1. **测试固定牌桌是环境开关**：`POKER_STAGE_B_TEST_TABLE=1` 仅在非 production 且显式设置时生效；它不接受客户端牌序，生产默认仍是安全随机源。该路径在源码中存在，后续可移到独立测试服务器以减少生产包体积。
2. **Next.js 开发服务器只允许同项目一个实例**：浏览器补码测试需要先停掉普通 dev server，再以测试环境启动；正常测试与补码测试不能同时共享 3000 端口。
3. **S02 浏览器重启未纳入常规 CI**：本轮已用 Playwright `storageState` 实际执行“停进程→重启→刷新”，显示过期提示；该流程未包装成可重复的自动测试。
4. **Stage C 功能未实现**：Key、模式、epoch、PendingDecision、真实模型调用仍未开始。
5. **Stage B 没有视觉细调**：桌面/移动截图可用，但未做完整可访问性/动画/视觉验收。
6. **start 的 requestId 幂等**：start 接口创建新桌；`requestId` 目前未用于 start 的重复请求去重，后续可在 API 层补。
7. **测试 fixture 与生产并存**：已在文档和代码注释中标注，生产环境不设置该环境变量时不会启用。

## 5. 启动方式

```bash
# Node >= 24.15
pnpm install --frozen-lockfile
pnpm dev
# http://127.0.0.1:3000
```

验证：

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:browser   # 需要先启动 dev server
```

## 6. 下一步 Stage C

- sessionStorage Key、用户主动测试连接、清除/更换。
- `/api/ai/test`、`/api/ai/mode`、`/api/ai/decision` 的 BYOK/epoch/pending。
- 并发、幂等、在途取消与版本冲突。
- 继续把 S01 扩展到新接口；保持 Stage B 15 文件/27 测试回归。
