# Poker AI — 项目进度

- 当前阶段：**Stage C 完成；Stage D 未开始**
- 本轮日期：2026-10-22
- 目标目录：`F:\code\PokerAI`
- Git 远端：`https://github.com/godorjes/PokerAI.git`
- 本轮性质：BYOK、Key 测试/清除/轮换、模式 epoch、PendingDecision、并发/idempotency；**未调用真实 DeepSeek API**

---

## 1. 本轮结论

- 浏览器可配置临时 DeepSeek Key、主动测试、启用/停用/轮换、清除。
- 服务端新增 `/api/ai/test`、`/api/ai/mode`；`/api/ai/decision` 支持 BYOK、aiEpoch、pending。
- 同一回合重复决策只产生一个逻辑流程；旧请求/旧 epoch 不能提交。
- A03、A04、K01、K03 通过；S01 扩展到 mode。
- Stage B 回归通过；测试合计 **17 文件 / 38 测试**。
- 真实 DeepSeek 调用 **0 次**，无 usage；不能声称真实联调完成。

详细记录见 `docs/plans/stage-c-report.md`。

---

## 2. 实际实现

### 2.1 客户端 BYOK

`src/app/page.tsx`：

- `sessionStorage` Key（`poker-ai.deepseek-key`），不写 localStorage。
- 用户主动“保存并测试”；不自动测试。
- 状态：未配置、测试中、可用、Key 无效、余额不足、限流、暂不可用、清除但服务端停用未确认。
- “启用智能”“轮换 Key”“停用智能”“清除 Key”。
- 智能模式决策只通过 `x-deepseek-api-key` 请求头发送 Key。
- 新 Key 已验证且模式 enabled 时，先 mode rotate 推进 epoch，再切换当前 Key。
- 清除 Key 立即移除本地引用并停止新调度，再请求 mode disable。
- 服务端 enabled 但本地无 Key 时自动停用并回退本地策略。
- pending 时轮询 state，不重复发起同一回合决策。

### 2.2 服务端 AI 边界

新增：

- `src/server/ai/gateway.ts`
- `src/server/ai/http-gateway.ts`
- `src/app/api/ai/test/route.ts`
- `src/app/api/ai/mode/route.ts`
- `src/server/session/mutex.ts`

行为：

- 固定上游 `https://api.deepseek.com`。
- Key 仅按请求传入；Gateway 对象不保存 Key；Session 不保存 Key。
- 测试连接走 `GET /models`；决策走 `/chat/completions`。
- 请求/响应 `no-store`；不记录 Key、提示词或原始响应。
- 模式操作不携带 Key。
- `enable/disable/rotate` 均推进 `aiEpoch` 与 `stateVersion`；`rotate` 即使仍 enabled 也推进。
- 模式变更清除 pending，使旧结果失效。
- 版本冲突返回 `STALE_STATE`。

### 2.3 PendingDecision 与并发

`src/server/session/service.ts` + `mutex.ts`：

- 每桌异步互斥锁；远程等待在锁外。
- 同一回合至多一个 pending；重复请求返回 pending，不增加 gateway 调用。
- pending 字段：decisionId、actor、handId、turnId、expectedVersion、aiEpoch、开始/截止时间。
- 提交前复核 handId/turnId/stateVersion/aiEpoch/actor。
- 释放只匹配原 decisionId；旧响应不能清除新预留。
- 超时/上游失败回退本地策略并清除自己的 pending；不覆盖新 pending。
- requestId 结果幂等；同 ID 不同内容拒绝。
- `GameStateResponse` 增加 `aiEpoch`、`pendingDecision`，不返回 Key。

---

## 3. 验收覆盖

| 编号               | 状态     | 实际证据                                                                                   |
| ------------------ | -------- | ------------------------------------------------------------------------------------------ |
| A03                | **通过** | `tests/session/ai.test.ts`：同回合两请求只调用 gateway 1 次；第二个 pending；最终 1 个动作 |
| A04                | **通过** | rotate/disable 后旧响应 `STALE_STATE`；牌局不变；旧 epoch 不提交                           |
| K01                | **通过** | 两个 owner 的测试/决策只用各自 Key；响应不含 Key                                           |
| K03                | **通过** | 在途 decision 时 disable；旧响应不能提交；pending 释放                                     |
| S01（扩展）        | **通过** | 外来 owner 对 state/action/next/decision/mode 全部 404                                     |
| 停用版本冲突       | **通过** | stale expectedVersion 的 disable 返回 STALE_STATE，epoch 不变                              |
| 同状态 rotate      | **通过** | 同 stateVersion 下 rotate 仍推进 epoch                                                     |
| 旧请求不释放新预留 | **通过** | 旧 pending 到期、新 decisionId 建立；旧响应到达后新预留仍在                                |
| Stage A/B 回归     | **通过** | 17 文件 / 38 测试全绿                                                                      |

---

## 4. 验证结果

本机 PATH Node 21.5.0 不满足引擎要求；通过 bundled Node 24.21.0 + pnpm 11.7.0 执行：

```text
pnpm test
Test Files  17 passed (17)
Tests       38 passed (38)

pnpm typecheck   通过（next typegen + tsc）
pnpm lint        通过
pnpm format:check 通过
pnpm build       Next.js 16.4.2 生产构建通过
```

Stage C 新增测试：

- `tests/session/ai.test.ts`（9 个场景）
- `tests/session/http-gateway.test.ts`（2 个固定上游/请求头测试）
- `tests/browser/key-storage.spec.ts`
- `tests/browser/mode.spec.ts`
- `tests/browser/ownership.spec.ts`（扩展到 mode）
- `tests/browser/table.spec.ts`（heading 更新）

浏览器：

```text
pnpm test:browser
4 passed, 1 skipped
```

- key-storage：Key 只在 sessionStorage；clear 后移除。
- mode：enable → rotate → disable；rotate 推进 epoch。
- ownership：外来 owner 的 state/action/next/decision/mode 全部 404。
- table：3 手、提前弃牌、刷新恢复、V03。
- rebuy：确定性 fixture 另行 1 passed。

证据：

- [Stage C 桌面](evidence/stage-c-table.png)
- [Stage C 移动端](evidence/stage-c-mobile.png)
- [Stage B 补码/过期证据](evidence/stage-b-rebuy.png)

---

## 5. 实际修改文件

主要文件：

- `src/app/page.tsx`
- `src/app/api/ai/test/route.ts`
- `src/app/api/ai/mode/route.ts`
- `src/app/api/ai/decision/route.ts`
- `src/app/api/_lib/http.ts`
- `src/server/ai/gateway.ts`
- `src/server/ai/http-gateway.ts`
- `src/server/session/service.ts`
- `src/server/session/types.ts`
- `src/server/session/store.ts`
- `src/server/session/mutex.ts`
- `src/server/session/errors.ts`
- `src/shared/api.ts`
- `tests/session/ai.test.ts`
- `tests/session/http-gateway.test.ts`
- `tests/browser/key-storage.spec.ts`
- `tests/browser/mode.spec.ts`
- `tests/browser/ownership.spec.ts`
- `tests/browser/table.spec.ts`
- `tests/session/service.test.ts`（异步 decision/aiEpoch 适配）
- `docs/plans/stage-c-report.md`
- `docs/evidence/stage-c-*.png`

---

## 6. 真实 API 边界

- 真实 DeepSeek 请求：**0 次**。
- usage：无。
- 测试使用 FakeGateway；HTTP 适配器只在单元测试中注入 fake `fetch`，没有访问网络。
- 没有使用真实 Key；未进行 `/models` 或 `/chat/completions` 联调。
- Stage D 仍需验证：真实模型输出、思考模式、usage、延迟、错误分类。

---

## 7. 已知问题

1. **Stage D 未开始**：真实提示词、thinking 关闭、usage、A01/A02 尚未完成。
2. **真实网络适配未联调**：仅固定 URL/请求头/JSON 单元测试。
3. **测试 fixture 仍在生产源码**：仅 `POKER_STAGE_B_TEST_TABLE=1` 且非 production 生效。
4. **start requestId 幂等未实现**。
5. **限流/请求体大小限制未实现**。
6. **sessionStorage 不可用时无显式 UI 提示**：当前静默退化。
7. **Pending 12 秒真实等待未做真实网络测量**：用可控延迟替身覆盖逻辑。
8. **单进程内存会话**：重启丢 pending/session，是设计边界。
9. **S02 浏览器重启脚本仍是手工/独立脚本**，不在 CI。

不阻挡 Stage D；第 4/5/6 项应在后续安全/Stage E 前置补齐。

---

## 8. Git

- Stage A：`c75c62a`
- Stage B：`59239ff`
- Stage C：本轮完成后创建并推送；哈希与推送结果见最终汇报。
- 不覆盖远端历史、不强推。

---

## 9. 下一步（Stage D）

1. 四个机器人独立视图、牌风提示词、当前手公开行动历史。
2. 真实模型非思考模式、输出预算、12 秒节点超时、有限重试。
3. JSON/字段/金额/合法动作校验，错误分类，本地降级。
4. A01、A02、V01；用四个 seat 的可控结果证明实际动作随模型改变。
5. 回归 A03/A04/K01/K03；仅在用户明确授权时做小额真实联调。

---

## 10. 历史

- Round 0（2026-10-22）：空项目检查、规范读取、A—E 计划。
- Round 1：Stage A 规则/契约；`c75c62a`。
- Round 2：Stage B 五人桌、本地机器人、匿名会话、补码；`59239ff`。
- Round 3：Stage C BYOK、模式 epoch、PendingDecision、并发控制。
