# Poker AI — 项目进度

- 当前阶段：**Stage A 已完成；Stage B 未开始**
- 本轮日期：2026-10-22
- 目标目录：`F:\code\PokerAI`
- Git 远端：`https://github.com/godorjes/PokerAI.git`
- 本轮性质：实现规则适配、金额协议、合法动作、公开视图和 G01—G09/G11 测试；**未实现牌桌 UI、会话层、DeepSeek 调用**

---

## 1. 本轮结论

Stage A 的规则与契约已可独立运行：

- 采用 `@pokertools/engine@2.1.0` + `@pokertools/evaluator@2.1.0`。
- 5 座、5/10 盲注、`action + amountTo`、合法动作查询、短全下、重新开放加注、边池、未跟注退款、零头、牌型比较均有实际测试。
- `pnpm test`：**13 个测试文件、21 个测试全部通过**。
- `pnpm typecheck`、`pnpm lint`、`pnpm build`：通过。
- 没有运行浏览器、Next.js、真实 DeepSeek API；这些不属于 Stage A 的已完成项。

详细能力记录见 `docs/plans/rule-engine-assessment.md`。

---

## 2. 本轮实现内容

### 2.1 项目与工具链

- 初始化 Git 仓库（`main`），添加远端 `origin`。
- 建立 TypeScript + Vitest 领域包；锁定 pnpm 11.7.0、Node `>=24.15.0`。
- 将用户提供的两份规范逐字导入 `docs/specs/`；SHA256 前缀分别为 `794894DC05DC...`、`D8A6E7119E17...`。
- 安装并锁定：
  - `@pokertools/engine@2.1.0`
  - `@pokertools/evaluator@2.1.0`
  - `@pokertools/types@2.1.0`
  - `typescript@5.9.3`、`vitest@3.2.4`、`eslint@9.39.1`、`typescript-eslint@8.46.4`、`prettier@3.6.2`
- 允许 esbuild 的标准安装脚本（`pnpm-workspace.yaml` 的 `allowBuilds`），否则 Vitest 无法运行。
- 建立 `pnpm-lock.yaml`；`.spike/`、`node_modules/`、`dist/` 均不提交。

### 2.2 规则适配层

文件：

- `src/shared/contracts.ts`
- `src/server/engine/legal-actions.ts`
- `src/server/engine/action-mapper.ts`
- `src/server/engine/table.ts`
- `src/server/engine/index.ts`

实现的行为：

- 服务端唯一裁决；`PokerTable` 包装库的 `PokerEngine`。
- 公开契约使用 `action + amountTo`，`amountTo` 是当前街累计目标额。
- 合法动作返回 `actions/toCall/minBetTo/minRaiseTo/maxTo/canOnlyShortAllIn`。
- 普通下注/加注与短全下分开；非法金额不夹取，抛稳定错误。
- `all_in` 自动映射为 `BET`/`RAISE`/`CALL`，不把短全下误当重新开放。
- 公开视图采用字段白名单；不返回 `deck`、`config`、`previousStates`、`randomProvider`。
- 赢家按座位聚合，避免库按池返回多条 Winner 导致重复/少算。
- 首手按钮使用公开 `snapshot/restore` 在发牌前补位；生产使用 Node CSPRNG 选按钮。
- 测试固定牌序使用脚本化 `randomProvider`；该辅助代码仅在 `tests/support`。

### 2.3 测试

规则测试：

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

契约测试：

- `tests/contracts/amount-and-actions.test.ts`
- `tests/contracts/public-view.test.ts`
- `tests/contracts/table-factory.test.ts`

测试支持：

- `tests/support/table.ts`（固定牌序、5 座测试表）
- `tests/support/g04.ts`（G04/G05 共享场景）

---

## 3. 验收覆盖

| 编号 | 结果     | 实际断言/证据                                                                             |
| ---- | -------- | ----------------------------------------------------------------------------------------- |
| G01  | **通过** | BB 已投 10，加注至 30；`chipsMoved=20`，余额 970，动作记录 `amountTo=30`                  |
| G02  | **通过** | 30 → 45 短全下；C 最小加注 `65`；A 回来时 `toCall=15`，无 `raise`，尝试加注被拒且状态不变 |
| G03  | **通过** | 30 → 45 → 50；A 的 `minRaiseTo=70`；加注 70 成功，`chipsMoved=40`，余额 930               |
| G04  | **通过** | A 350、B 400、C 退回 200；D 不参与；`uncalled_return=200`；总额 2900                      |
| G05  | **通过** | A 350 / B 400 / C 200；A 的 aces 胜 B 的 kings，B 的 kings 胜 C 的 queens；D/E 不获奖     |
| G06  | **通过** | 全员跟注后仍停在翻前，BB `toCall=0`，可过牌/加注；过牌后才发翻牌                          |
| G07  | **通过** | 一人全下后其他玩家仍可加注；未提前发完公共牌；全下者状态保持                              |
| G08  | **通过** | 弃牌立即结算、无公共牌；四人平局 45 池，零头给按钮左侧首个赢家（12/11/11/11）             |
| G09  | **通过** | A2345 为顺子且弱于 23456；踢脚区分一对；公共牌皇家同花顺作为最佳牌；花色不决定胜负        |
| G11  | **通过** | BB 仅 3 全下；UTG 跟注 10；最小加注 20；轮末跳过已全下 BB                                 |

未覆盖/不在 Stage A：

- **G10**：手间补码属于 Stage B，本轮没有伪造通过。
- **A01—A04、V01—V03、K01—K03、S01—S02**：后续阶段。
- 浏览器、真实 DeepSeek API：未执行。

---

## 4. 实际验证命令与结果

由于本机 PATH 中的 Node 是 `21.5.0`，不满足规则库要求，本轮显式使用 bundled Node 24.21：

```powershell
$node = 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'
$pnpm = 'C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.cjs'
$env:Path = "C:\Users\Administrator\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin;$env:Path"
```

### 4.1 版本与安装

```powershell
& $node --version
& $node $pnpm --version
```

实际结果：

```text
v24.21.0
11.7.0
```

安装：

```powershell
& $node $pnpm install
```

实际结果（摘要）：

```text
Packages: +4
dependencies:
+ @pokertools/engine 2.1.0
+ @pokertools/evaluator 2.1.0
+ @pokertools/types 2.1.0
...
devDependencies: ...
esbuild postinstall: Done
Done
```

### 4.2 测试

```powershell
& $node $pnpm test -- --reporter=verbose
```

实际结果：

```text
Test Files  13 passed (13)
Tests       21 passed (21)
```

### 4.3 类型检查

```powershell
& $node $pnpm typecheck
```

结果：退出码 0，无错误输出。

### 4.4 Lint

```powershell
& $node $pnpm lint
```

结果：退出码 0，无错误输出。

### 4.5 构建

```powershell
& $node $pnpm build
```

结果：退出码 0，无错误输出；`tsc -p tsconfig.build.json` 生成 `dist/`（已忽略）。

### 4.6 格式检查

```powershell
& $node $pnpm format:check
```

结果：`All matched files use Prettier code style!`

---

## 5. Git

- 已初始化 `main`，远端 `origin` 指向用户提供的 GitHub 地址。
- 本轮创建一个本地 Git 提交；提交哈希与推送结果见本轮最终汇报，避免在提交前写入虚构哈希。
- 推送前已确认远端没有已有分支历史；不会强推或覆盖。
- 远端若拒绝认证/网络失败，会记录真实错误，不声称已推送。

---

## 6. 已知偏差与未解决问题

1. **Next.js shell 顺延到 Stage B**
   - Stage A 实际建立 TypeScript + Vitest 领域包，`pnpm build` 使用 `tsc`。
   - Stage A 的验收对象是规则/契约；浏览器牌桌在 Stage B 加入。此偏差已写入实施计划。
2. **Node 版本**
   - 本机 PATH 默认 Node 21.5.0，不满足 `@pokertools/engine` 的 `^24.15.0`。
   - 项目声明 `>=24.15.0`，本轮所有命令通过 bundled Node 24.21.0 执行。
   - CI/部署必须显式使用 Node 24.15+，不能沿用 PATH 默认版本。
3. **固定牌序与首手按钮是测试/适配补位**
   - 依赖库的 `randomProvider` 和公开快照；升级库版本时必须重跑规则测试。
   - 生产不能接受客户端牌序/种子。
4. **库没有整体合法动作 API**
   - 适配层自行推导，已覆盖当前 Stage A 场景；Stage B 接入 UI 后需继续回归。
5. **`turnId` 只是 Stage A 事件序列**
   - 真正并发/幂等凭据在 Stage C 的 Session/PendingDecision 中实现。
6. **未验证**
   - Next.js 构建、浏览器 UI、刷新恢复、真实 DeepSeek 调用、Key 隔离、付费调用。

---

## 7. 下一步（Stage B）

1. 建立 Next.js 页面外壳与五座牌桌 UI。
2. 实现 game start/state/action/next API、匿名 Cookie、单进程内存会话、过期/刷新边界。
3. 四名基础机器人（不使用 Key）和浏览器逐回合推进。
4. 补 G10、V03、S02、S01 当前接口部分，并实际走通至少三手、提前弃牌、输光补码、刷新恢复。
5. 保持 Stage A 的 21 个测试作为回归门禁。

---

## 8. 历史记录

- Round 0（2026-10-22）：检查空项目、读取规范、核查候选库、创建 A—E 计划与 `docs/progress.md`。
- Round 1（2026-10-22）：执行 Stage A；完成规则适配、金额契约、合法动作、视图与 G01—G09/G11 测试。
