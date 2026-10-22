# Poker AI — 项目进度

- 当前阶段：**Stage B 完成；Stage C 未开始**
- 本轮日期：2026-10-22
- 目标目录：`F:\code\PokerAI`
- Git 远端：`https://github.com/godorjes/PokerAI.git`
- 本轮性质：实现无 Key 可玩的五人桌、匿名内存会话、本地机器人、手间补码与浏览器流程；**未实现 BYOK/DeepSeek 调用**

---

## 1. 本轮结论

- 五人桌可在浏览器实际游玩：真人动作、四个本地机器人按顺序推进、结算、下一手。
- 会话绑定匿名 HttpOnly Cookie；单进程内存、30 分钟空闲过期、刷新恢复边界已实现。
- G10、V03、S02、S01 当前接口均已覆盖（S02 含实际重启后的浏览器过期提示）。
- Stage A 原有 13 个文件/21 个测试保留，加上 Stage B 新增测试后合计 15 个文件/27 个测试全绿；另有独立浏览器测试。
- Next.js 生产构建通过。
- 未调用真实 DeepSeek API；Key/BYOK 属于 Stage C。

详细交付记录见 `docs/plans/stage-b-report.md`。

---

## 2. 实际实现

### 2.1 Next.js 页面

- `src/app/page.tsx`：牌桌、行动面板、行动记录、结算/下一手、刷新/新牌桌。
- `src/app/globals.css`：桌面与移动端布局。
- `src/app/layout.tsx`、`src/app/api/**/route.ts`。
- 五个固定座位，按按钮位置动态计算 BTN/SB/BB/UTG/CO。
- 自己的底牌明牌；对手未公开底牌显示背面；摊牌/全下按引擎的亮牌规则显示。
- 下注/加注金额输入显示最小/最大；短筹码跟注显示实际全下金额。

### 2.2 API

| 接口                    | 实际行为                                                 |
| ----------------------- | -------------------------------------------------------- |
| `POST /api/game/start`  | 创建牌桌；发匿名 HttpOnly Cookie；`restart` 可清旧桌     |
| `GET /api/game/state`   | owner 校验；白名单可见状态；`no-store`                   |
| `POST /api/game/action` | 真人动作；校验 `handId/turnId/expectedVersion/requestId` |
| `POST /api/game/next`   | 仅结算后；机器人自动补码；真人零筹码需 `rebuy:true`      |
| `POST /api/ai/decision` | 本地基础策略；无 Key；浏览器逐回合推进                   |

### 2.3 会话与安全

- `GameSessionStore`：单进程 `Map`、30 分钟空闲 TTL、最多 100 个会话。
- 匿名 owner：32 字节随机 Cookie，HttpOnly、SameSite=Lax；生产 Secure。
- 所有牌局接口校验 owner；跨 owner 统一 404，不泄露存在性。
- 写接口同源检查；响应 `Cache-Control: no-store`。
- `stateVersion`、`handId`、`turnId` 校验；`requestId` 幂等记录，不同内容冲突。
- 进程重启/内存丢失：`SESSION_NOT_FOUND`；空闲过期：`SESSION_EXPIRED`。
- 浏览器刷新读取服务器状态，不依赖客户端状态恢复牌局。

### 2.4 本地机器人

- `src/server/bot-strategy/local.ts`。
- 四个牌风：紧弱、松凶、均衡、当前手观察适应。
- 仅用 `BotDecisionView` 和合法动作；无随机假决策。
- 无 Key 路径来源标记 `local_no_key`。
- 浏览器按 actionTo 串行调用 `/api/ai/decision`，后一个机器人看到前一个已执行动作。

### 2.5 手间补码

- `PokerTable.addChips` → 库的 `pendingAddOn`，下一手发牌时合并。
- 结算后零筹码机器人自动补至 1,000；真人零筹码必须显式补充。
- 本手内禁止补码/下一手。
- 补码事件记录 `auto_bot` / `human_rebuy`，响应 `topUps` 可见。
- 真人补码后仍五人，下一手正常继续。

---

## 3. 验收状态

| 编号         | 状态                   | 实际证据                                                                                                                       |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| G10          | **通过**               | `tests/session/service.test.ts` 真实引擎场景：两个零筹码座位，下一手自动/显式补码；确定性浏览器测试实际点击“补充 1,000 并继续” |
| V03          | **通过**               | 公开视图测试 + 浏览器对 `/api/game/state` 原文检查，无 `deck`/`previousStates`/`decisionSummary`                               |
| S02          | **通过**               | 浏览器刷新恢复；服务层空闲过期/重启测试；实际停进程→重启后刷新页面显示过期提示                                                 |
| S01          | **通过（本阶段接口）** | 独立匿名 owner 对 state/action/next/decision 全部 404；insight/mode 在后续阶段补齐                                             |
| Stage A 回归 | **通过**               | G01—G09、G11、金额/合法动作/视图测试全部保留                                                                                   |

浏览器实际走通：

- 连续 3 手；
- 真人提前弃牌，机器人继续完成本手；
- 刷新后仍是同一 gameId、同一手牌状态；
- 独立 owner 无法读取/操作别人的桌；
- 确定性测试桌面实际走通“真人 + 机器人同时输光 → 补充 1,000 → 第 2 手”。

视觉证据：

- [桌面](evidence/stage-b-table.png)
- [移动端](evidence/stage-b-mobile.png)
- [补码结算](evidence/stage-b-rebuy.png)
- [补码后的下一手](evidence/stage-b-next-hand.png)
- [服务端重启后的过期提示](evidence/stage-b-expired.png)

---

## 4. 实际验证命令与结果

本机 PATH 的 Node 是 21.5.0，不满足引擎要求；以下通过 bundled Node 24.21.0 执行：

```powershell
$node = 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm = 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs'
$env:Path = "C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:Path"
```

### 4.1 单元/集成测试

```text
& $node $pnpm test
Test Files  15 passed (15)
Tests       27 passed (27)
```

### 4.2 类型检查、Lint、格式、构建

```text
& $node $pnpm typecheck    → 退出码 0
& $node $pnpm lint         → 退出码 0
& $node $pnpm format:check → All matched files use Prettier code style!
& $node $pnpm build        → Next.js 16.4.2 生产构建通过
```

构建路由：

```text
○ /
ƒ /api/ai/decision
ƒ /api/game/action
ƒ /api/game/next
ƒ /api/game/start
ƒ /api/game/state
```

### 4.3 正常浏览器测试

前置：`pnpm dev --hostname 127.0.0.1 --port 3000`。

```text
& $node $pnpm test:browser
2 passed, 1 skipped
```

- `table.spec.ts`：3 手、提前弃牌、刷新恢复、V03 网络 DTO。
- `ownership.spec.ts`：两个匿名 owner 的 state/action/next/decision 隔离。
- `rebuy.spec.ts`：正常服务器下跳过（需要确定性 fixture）。

### 4.4 确定性补码浏览器测试

```powershell
$env:POKER_STAGE_B_TEST_TABLE='1'
& $node $pnpm dev --hostname 127.0.0.1 --port 3000
```

另开进程：

```powershell
$env:POKER_TEST_REBUY='1'
& $node $pnpm exec playwright test tests/browser/rebuy.spec.ts
# 1 passed
```

实际结果：真人 1 筹码全下、与 1 筹码机器人一同输光；按钮变为“补充 1,000 虚拟筹码并继续”；点击后进入第 2 手，真人/机器人恢复筹码。

---

## 5. 实际修改文件

主要文件：

- `src/app/page.tsx`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/api/game/start/route.ts`
- `src/app/api/game/state/route.ts`
- `src/app/api/game/action/route.ts`
- `src/app/api/game/next/route.ts`
- `src/app/api/ai/decision/route.ts`
- `src/app/api/_lib/http.ts`
- `src/server/session/store.ts`
- `src/server/session/service.ts`
- `src/server/session/errors.ts`
- `src/server/session/types.ts`
- `src/server/session/stage-b-test-table.ts`
- `src/server/bot-strategy/local.ts`
- `src/server/engine/table.ts`（增加 top-up/next-hand/turn/isSettled）
- `src/shared/api.ts`
- `tests/session/service.test.ts`
- `tests/contracts/table-lifecycle.test.ts`
- `tests/browser/table.spec.ts`
- `tests/browser/ownership.spec.ts`
- `tests/browser/rebuy.spec.ts`
- `playwright.config.ts`
- `package.json`、`pnpm-lock.yaml`、Next/Tailwind 配置
- `docs/plans/stage-b-report.md`
- `docs/evidence/*.png`

---

## 6. 已知问题与偏差

1. **测试 fixture 在生产源码中存在**
   - `POKER_STAGE_B_TEST_TABLE=1` 且非 production 才启用；不接受客户端牌序。
   - 仍会让测试代码进入 bundle；后续可移到独立测试服务器/构建。
2. **S02 浏览器重启脚本未纳入 CI**
   - 本轮实际执行了“停进程→重启→刷新”，页面显示过期提示。
   - 该流程使用独立 Playwright 脚本和 storageState，尚未包装成常规自动测试。
3. **Next dev 单实例限制**
   - 同一项目只能有一个 dev 实例；补码测试需停普通 dev 后重启环境 fixture。
4. **start 的 requestId 未做幂等**
   - 创建/重开是显式操作；后续可在 API 层补重复请求去重。
5. **Stage C 未开始**
   - Key、BYOK、test/mode/decision 的 epoch/pending、真实模型调用均未实现。
6. **视觉未细调**
   - 桌面/移动端可游玩；未有完整 a11y、动画、视觉回归测试。
7. **会话边界**
   - 单进程/单实例；重启即丢会话是设计边界。Cookie 可存活 7 天，但服务端会话 30 分钟空闲过期。

---

## 7. Git

- Stage A 提交：`c75c62a`。
- Stage B 提交：本轮完成后创建并推送；哈希与推送结果见本轮最终汇报。
- 不覆盖远端历史、不强推。

---

## 8. 下一步（Stage C）

1. sessionStorage Key、设置/测试/清除/更换。
2. `/api/ai/test`、`/api/ai/mode`、`/api/ai/decision` 的 BYOK 路径。
3. `aiEpoch`、PendingDecision、截止时间、在途取消、原子提交与幂等。
4. A03/A04/K01/K03；S01 扩展到 mode/decision。
5. 保持 Stage B 的 15 文件/27 测试与浏览器测试回归。

---

## 9. 历史

- Round 0（2026-10-22）：空项目检查、规范读取、A—E 计划。
- Round 1（2026-10-22）：Stage A 规则/契约与 G01—G09/G11；提交 `c75c62a`。
- Round 2（2026-10-22）：Stage B 五人桌、本地机器人、匿名会话、补码与浏览器验收。
