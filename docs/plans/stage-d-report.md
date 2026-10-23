# Stage D — DeepSeek 四机器人实际决策 交付记录

- 日期：2026-10-22
- 状态：**Stage D 离线实现与测试完成；真实 DeepSeek 联调未执行**
- 运行时：Node.js 24.21.0、pnpm 11.7.0、Next.js 16.4.2
- 真实 API 请求次数：**0**
- 真实 usage：**无**

> 本轮没有用户提供的真实 Key 或小额联调范围，因此不能声称真实 API 已验证。所有模型替身测试均为离线测试。

## 1. 实际实现

### 1.1 每名机器人独立输入

新增/修改：

- `src/server/bot-strategy/styles.ts`
- `src/server/ai/bot-input.ts`
- `src/server/ai/prompt.ts`
- `src/server/bot-strategy/local.ts`（复用同一牌风配置）

`BotDecisionInput` 是显式 allow-list DTO，不直接序列化 `GameSession`：

- 当前行动者的座位、玩家 ID、位置、牌风 ID/名称/行为倾向。
- 当前行动者自己的两张底牌。
- 公共牌、街道、按钮位、大盲位。
- 每名玩家公开的筹码、本轮投入、本手总投入、状态（无其他玩家底牌）。
- 主池/边池、当前底注、底池。
- 当前手公开动作历史（丢弃事件 ID 等不必要字段）。
- 合法动作与金额边界。

不进入 DTO：其他玩家隐藏底牌、剩余牌堆、完整引擎状态、历史私有推断。

四种牌风：

- AI-1 紧弱：保守参与、面对压力更易退出。
- AI-2 松凶：宽范围、主动下注/加注，但仍受筹码和位置约束。
- AI-3 均衡：综合位置、价格、牌面和公开下注。
- AI-4 观察：只根据当前手公开动作调整；不做跨手学习承诺。

### 1.2 请求配置

`src/server/ai/http-gateway.ts`：

- 固定上游 `https://api.deepseek.com`。
- 模型 `deepseek-flash`。
- 显式 `thinking: { type: "disabled" }`（官方文档确认默认开启）。
- `max_tokens: 800`。
- `stream: false`。
- `response_format: { type: "json_object" }`。
- 节点总预算默认 12 秒（`GameService` 的 `decisionTimeoutMs`），不是单次 fetch 的额外超时。
- 429、网络错误、5xx、408 等最多重试一次；400/401/402/非法输出不重试。
- 总预算由 service 控制，重试共享同一 12 秒窗口。

### 1.3 协议与校验

`src/server/ai/protocol.ts`：

- 空内容、空 JSON 对象、非 JSON、截断（`finish_reason=length`）、非法结构分类。
- 动作枚举、`amountTo` 形状（bet/raise 为正整数，其他必须 null）校验。
- `decisionSummary`、`confidenceLabel`、`opponentIntents` 的结构/长度/枚举。
- 意图目标必须是输入中的其他玩家；自指/未知/重复目标拒绝。

`src/server/ai/validate.ts`：

- 动作必须在该行动节点 `legalActions` 中。
- bet/raise 金额必须在 `minBetTo`/`minRaiseTo` 与 `maxTo` 窗口内。
- 不重写模型金额；非法建议直接拒绝并本地降级。
- 最终执行仍经过 `PokerTable.act` 的规则校验。

### 1.4 本地降级与来源

`src/server/session/service.ts`：

- 每个行动节点按行动顺序串行调用；后一个机器人读取已提交动作后的新状态。
- 成功执行模型建议：`source = "deepseek"`。
- 无 Key/模式关闭：`source = "local_no_key"`。
- Key 错误、超时、非法建议、上游失败：`source = "local_fallback"`，使用本地安全策略。
- 旧 pending/旧 epoch 仍由 Stage C 的 decisionId/version/epoch 校验保护。

### 1.5 用量与来源统计

`GameStateResponse.aiStats`：

- 决策请求次数（含重试）。
- 成功、失败、被拒绝建议数。
- 重试次数。
- DeepSeek/本地无 Key/本地兜底动作数。
- 连接测试请求/成功/失败数。
- prompt/completion/total tokens。
- usage 缺失次数（`usageUnconfirmed`）。

`GameStateResponse.lastDecision`：

- 最近已执行动作的座位、动作、金额、来源、时间、usage（若有）。
- 不包含 `decisionSummary`、模型内部理由或 opponent intents。

UI 在 DeepSeek Key 面板显示本桌请求/成功/拒绝/降级/重试、tokens 或“未确认”、连接测试次数、最近动作来源。

## 2. 验收覆盖

| 编号         | 状态     | 证据                                                                                                                                                   |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A01          | **通过** | `tests/session/stage-d.test.ts`：四个 seat 各注入两种不同合法结果，实际执行动作分别为两种；source=deepseek；统计/输入样式断言                          |
| A02          | **通过** | 非法动作、越界金额、Key 错误、临时错误一次重试、挂起超时、空内容、空 JSON、截断、非法 JSON、非法目标、错误金额形状；失败均不执行非法结果并释放 pending |
| V01          | **通过** | 同 own 牌/公开信息/牌风，替换其他玩家隐藏牌和剩余牌堆后 `BotDecisionInput` 深度相等；序列化中不含被替换牌                                              |
| Stage C 回归 | **通过** | 9 个 Stage C 测试全绿：重复回合、rotate/disable 旧响应、K01 隔离、旧请求不释放新预留、fallback                                                         |
| 顺序状态     | **通过** | 第二个机器人的输入包含第一个机器人已执行的 call 动作                                                                                                   |

## 3. 验证结果

```text
pnpm test
Test Files  18 passed (18)
Tests       55 passed (55)

pnpm typecheck   通过
pnpm lint        通过
pnpm format:check 通过
pnpm build       Next.js 16.4.2 生产构建通过
```

新增/关键测试：

- `tests/session/stage-d.test.ts`：13 个场景。
- `tests/session/http-gateway.test.ts`：6 个网关协议/配置/错误分类场景。
- `tests/session/ai.test.ts`：Stage C 9 个回归场景。
- `tests/session/service.test.ts`：Stage B 会话/G10 回归。

浏览器：

```text
pnpm test:browser
4 passed, 1 skipped
```

- key-storage、mode、ownership、table 均通过。
- rebuy fixture 另行执行：1 passed。
- Stage D 桌面/移动端截图已检查。

证据：

- [Stage D 桌面](../evidence/stage-d-table.png)
- [Stage D 移动端](../evidence/stage-d-mobile.png)

## 4. 真实 API

- **未调用真实 DeepSeek API。**
- **请求次数：0。**
- **usage：无。**
- 没有使用真实 Key，没有真实 `/models`、`/chat/completions` 请求。
- 真实 API 的模型质量、实际 JSON 合规率、延迟、计费和错误码仍**未验证**。

真实联调需要用户明确提供 Key 和小额请求范围。离线替身测试只能证明接入、校验、来源、统计和顺序状态链路。

## 5. 已知问题

1. **真实 API 未验证**：没有 Key/授权，不声称已连通。
2. **提示词质量未实测**：四牌风行为倾向和真实模型 JSON 合规率需要真实小样本调优。
3. **连接测试 `/models` 没有 token usage**：会计入请求/成功统计，并将缺失 usage 标为未确认；真实语义仍需联调确认。
4. **统计只在内存会话**：进程重启丢失，符合 Stage B 单实例边界。
5. **测试 fixture 仍在生产源码**：`POKER_STAGE_B_TEST_TABLE=1` 仅非 production 生效。
6. **start 的 requestId 幂等/限流/请求大小限制**仍未补齐。
7. **真实 12 秒节点等待只由可控 timeout 测试覆盖**，没有真实网络延迟测量。
8. **公开行动解读**尚未实现，属于 Stage E。
9. **S02 重启脚本未纳入 CI**。

这些不阻挡 Stage E 的离线工作；真实 API 联调需要另行授权。

## 6. 下一步

只进入 **Stage E**：公开行动解读、移动布局/下注操作/连接降级状态的浏览器验收、sessionStorage 刷新/关闭/恢复实测、单实例部署说明和完整交付文档。

真实 API 联调仍单独需要用户 Key 与明确的小额范围。
