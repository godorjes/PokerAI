# Stage C — BYOK、模式切换与并发控制 交付记录

- 日期：2026-10-22
- 状态：**Stage C 已完成；Stage D 未开始**
- 运行时：Node.js 24.21.0、pnpm 11.7.0、Next.js 16.4.2
- 真实 DeepSeek 调用：**0 次**（未联调）

> 本文件记录实际实现、模拟测试、浏览器检查和限制。没有真实 Key、没有真实网络联调时，不把模拟结果写成生产上游已验证。

## 1. 已实现

### 1.1 客户端 BYOK

`src/app/page.tsx`：

- Key 只保存在当前标签页 `sessionStorage`（`poker-ai.deepseek-key`）。
- 用户主动点击“保存并测试”才请求 `/api/ai/test`；不自动测试。
- 状态区分：未配置、测试中、可用、Key 无效、余额不足、限流、暂不可用、已清除但服务端停用未确认。
- “启用智能”“轮换 Key”“停用智能”“清除 Key”。
- 智能模式启用后按请求头发送 Key；不进入 body。
- 清除 Key 先移除 sessionStorage/输入框/组件状态，再调用 mode disable。
- 切换新 Key 且智能模式已启用时，先通过 mode rotate 推进 epoch，成功后才把新 Key 设为当前 Key。
- 服务端仍启用但没有本地 Key 时，自动尝试停用，再回退本地策略。

### 1.2 服务端 Key 边界

`src/server/ai/http-gateway.ts`：

- 固定上游 `https://api.deepseek.com`，客户端不能自选目的地。
- 每次调用接收 Key 参数；Gateway 实例不保存 Key。
- `x-deepseek-api-key` 只用于 `/api/ai/test` 与 `/api/ai/decision`。
- 测试连接使用 `GET /models`；决策使用 `/chat/completions`（Stage D 继续完善提示词/思考模式/usage）。
- 不记录 Key、请求头、提示词或原始响应。
- 请求/响应 `no-store`。

### 1.3 模式与 epoch

新增：

- `POST /api/ai/mode`
- `POST /api/ai/test`

实现：

- `enable`、`disable`、`rotate`。
- 每次操作推进 `aiEpoch`；`rotate` 即使仍为 enabled 也推进。
- 模式操作本身不携带 Key。
- 模式变更递增 `stateVersion`；旧 `expectedVersion` 返回 `STALE_STATE`。
- 停用/轮换清除 `PendingDecision`；旧 epoch 响应不能提交。

### 1.4 PendingDecision 与并发

`src/server/session/service.ts`、`src/server/session/mutex.ts`：

- 每桌一个异步互斥锁；等待远程模型时不持有长锁。
- 同一回合最多一个 PendingDecision。
- 重复 decision 请求返回 pending，不创建第二条上游调用。
- PendingDecision 含 decisionId、actor、handId、turnId、expectedVersion、aiEpoch、开始/截止时间。
- 提交时再次检查 handId/turnId/stateVersion/aiEpoch/actor。
- 释放只匹配原 decisionId；旧响应不能清除新预留。
- 超时/失败回退本地策略，清除自己的 pending；不覆盖新 pending。
- 模式变更、停用或轮换使旧响应失效。
- `requestId` 结果幂等；不同内容同 ID 拒绝。

## 2. 覆盖的验收

| 编号                     | 状态 | 证据                                                                                                  |
| ------------------------ | ---- | ----------------------------------------------------------------------------------------------------- |
| A03                      | 通过 | `tests/session/ai.test.ts`：两请求同回合，只产生 1 次 gateway 调用、最终 1 个动作；第二个返回 pending |
| A04                      | 通过 | rotate/disable 时旧响应返回 STALE_STATE，牌局不改变；旧 epoch 不提交                                  |
| K01                      | 通过 | 两个 owner 的测试/决策分别只使用 `key-a`/`key-b`；响应不含 Key                                        |
| K03                      | 通过 | 在途 decision 时 disable，旧响应不能提交；pending 清除                                                |
| S01（扩展）              | 通过 | 浏览器测试对外来 owner 的 state/action/next/decision/mode 全部 404                                    |
| 必测：停用版本冲突       | 通过 | stale `expectedVersion` 的 disable 返回 STALE_STATE，epoch 不变                                       |
| 必测：同状态 rotate      | 通过 | 相同 stateVersion 下 rotate 仍递增 epoch                                                              |
| 必测：旧请求不释放新预留 | 通过 | 旧 pending 到期后新预留建立；旧响应到达后新 decisionId 仍在                                           |
| Stage B 回归             | 通过 | 原 15 文件/27 测试保留；新增后共 17 文件/38 测试                                                      |

## 3. 验证结果

```text
pnpm test
Test Files  17 passed (17)
Tests       38 passed (38)

pnpm typecheck  通过（next typegen + tsc）
pnpm lint       通过
pnpm format:check 通过
pnpm build      Next.js 16.4.2 生产构建通过
```

测试分布：

- `tests/session/ai.test.ts`：9 个 Stage C 场景。
- `tests/session/http-gateway.test.ts`：2 个固定上游/请求头测试。
- `tests/session/service.test.ts`：4 个 Stage B 会话/G10 测试。
- Stage A/B 其余测试：全部保留。

浏览器：

```text
pnpm test:browser
4 passed, 1 skipped
```

实际通过：

- `key-storage.spec.ts`：Key 只在 sessionStorage，clear 后本地移除。
- `mode.spec.ts`：enable → rotate → disable；rotate 推进 epoch。
- `ownership.spec.ts`：外来 owner 对 state/action/next/decision/mode 全部 404。
- `table.spec.ts`：3 手、提前弃牌、刷新恢复、V03 网络 DTO。
- `rebuy.spec.ts`：用确定性 fixture 另行执行，1 passed。

证据：

- [Stage C 桌面](../evidence/stage-c-table.png)
- [Stage C 移动端](../evidence/stage-c-mobile.png)

## 4. 模拟验证与真实联调

- **模拟验证**：FakeGateway 注入成功/失败/延迟；测试决定、模式、pending、epoch。
- **真实联调**：**未执行**。请求次数 0，usage 无。
- 没有使用真实 Key，也没有调用 `/models` 或 `/chat/completions` 的真实上游。
- 真实适配器已实现固定 URL、请求头、JSON 模式和基本动作解析，但提示词、thinking、usage、完整错误分类仍属 Stage D 验收。

## 5. 已知限制

1. **Stage D 仍需完成**：真实模型提示词、思考模式关闭、usage 统计、完整 A01/A02 验收。
2. **`/api/ai/test` 的真实网络路径未联调**：只验证了 FakeGateway 和固定 URL 单元测试。
3. **测试 fixture 仍在生产源码**：`POKER_STAGE_B_TEST_TABLE=1` 仅非 production 生效。
4. **start 的 requestId 幂等未实现**。
5. **限流/请求体大小限制未实现**。
6. **sessionStorage 不可用时没有显式提示**：当前仅静默退化，Stage E/K02 需要完整提示。
7. **Pending 超时的真实 12 秒等待未做真实网络测量**；逻辑用可控延迟替身覆盖。
8. **单进程内存会话**：重启丢 pending/session，是设计边界。

## 6. 下一步

只进入 Stage D：

1. 四名机器人独立视图与牌风提示词。
2. 真实模型行动校验、JSON/截断/非法金额、本地降级。
3. 四个 seat 分别注入至少两种合法模型结果，证明实际动作随结果变化。
4. A01、A02、V01，并回归 Stage C 的 A03/A04/K01/K03。
5. 真实 API 仅在用户明确提供 Key 和小额范围时进行联调。
