# Poker AI — 项目进度

- 当前阶段：**Stage D 完成（离线）；真实 DeepSeek 联调未验证；Stage E 未开始**
- 本轮日期：2026-10-22
- 目标目录：`F:\code\PokerAI`
- Git 远端：`https://github.com/godorjes/PokerAI.git`
- 本轮性质：四机器人牌风输入、正式模型决策链路、非思考/预算/超时/重试、协议校验、降级、来源与 usage 统计
- 真实 DeepSeek 请求：**0 次**；usage：**无**

---

## 1. 本轮结论

- 四名机器人各自使用独立牌风配置、自己的底牌、公共信息、当前手公开动作历史和合法金额边界。
- DeepSeek 请求显式关闭思考模式，输出上限 800 tokens，节点总预算 12 秒，429/网络/5xx 最多重试一次。
- 模型输出经过 JSON 结构、字段、金额、合法动作、意图目标校验；非法结果不执行，转本地兜底。
- 实际执行动作标记 `deepseek`、`local_no_key`、`local_fallback`，并在状态/UI 显示最近来源。
- 会话统计请求、成功、失败、拒绝、重试、动作来源、tokens；usage 缺失显示“未确认”。
- 服务器执行动作后更新状态，后一个机器人读取新状态；已用测试证明第二个机器人输入包含前一动作。
- A01、A02、V01 通过；Stage C 9 个并发/隔离测试回归通过。
- 测试合计 **18 文件 / 55 测试**。

详细记录：[stage-d-report.md](plans/stage-d-report.md)。

---

## 2. 实际实现

### 2.1 机器人独立输入与牌风

新增：

- `src/server/bot-strategy/styles.ts`
- `src/server/ai/bot-input.ts`
- `src/server/ai/prompt.ts`
- `src/server/ai/protocol.ts`
- `src/server/ai/validate.ts`

`BotDecisionInput` 是显式 allow-list DTO：

- 当前行动者、位置、牌风 ID/名称/行为倾向。
- 自己的两张底牌。
- 公共牌、街道、按钮位、大盲位。
- 所有玩家公开筹码/投入/状态（不复制他人底牌）。
- 主/边池、当前底注、底池。
- 当前手公开动作历史。
- 合法动作和金额窗口。

其他玩家隐藏牌、剩余牌堆、完整引擎状态、私有推断不进入 DTO。

### 2.2 DeepSeek 请求

`src/server/ai/http-gateway.ts`：

- 固定 `https://api.deepseek.com`。
- `deepseek-flash`。
- `thinking: { type: "disabled" }`。
- `max_tokens: 800`。
- `stream: false`、`response_format: json_object`。
- 总节点预算默认 12,000ms；429/网络/408/5xx 最多重试一次，共享总预算。
- 400/401/402/截断/非法响应不重试。
- Key 只在单次请求作用域；不保存、不记录。
- 未调用真实 API。

### 2.3 校验与降级

- 空内容、空 JSON、非 JSON、截断、错误结构分类。
- 动作枚举、bet/raise 金额形状、其他动作 amountTo=null。
- 服务端合法动作/金额窗口校验，不重写金额。
- `opponentIntents` 目标必须是输入中的其他玩家，不能自指/重复/未知。
- 非法或失败建议不执行，使用本地策略，来源 `local_fallback`。
- 安全本地策略仍经过 `PokerTable.act` 规则校验。

### 2.4 来源与用量

`GameStateResponse.aiStats`：

- 请求/成功/失败/拒绝/重试。
- DeepSeek/无 Key/本地兜底动作数。
- 连接测试请求/成功/失败。
- prompt/completion/total tokens。
- `usageUnconfirmed` 缺失用量次数。

`GameStateResponse.lastDecision`：

- 最近动作、金额、座位、来源、时间、usage。
- 不包含私有 `decisionSummary` / opponent intents。

UI 在 Key 面板显示统计和最近动作来源；无 Key 时仍显示本地来源。

---

## 3. 验收覆盖

| 编号         | 状态     | 证据                                                                                                                  |
| ------------ | -------- | --------------------------------------------------------------------------------------------------------------------- |
| A01          | **通过** | 四个 seat 各注入两种不同合法模型结果，实际动作分别随结果改变，来源 deepseek；`stage-d.test.ts`                        |
| A02          | **通过** | 非法动作/金额、Key 错误、临时错误重试、超时、空内容、空 JSON、截断、非法 JSON、非法目标、错误金额形状；不执行非法结果 |
| V01          | **通过** | 替换其他玩家隐藏牌和剩余牌堆，`BotDecisionInput` 深度相等；序列化不含被替换牌                                         |
| Stage C 回归 | **通过** | 9 个 A03/A04/K01/K03、版本/epoch/pending 场景全绿                                                                     |
| 顺序状态     | **通过** | 第二个机器人输入包含第一个已执行动作                                                                                  |
| 来源/统计    | **通过** | 请求、重试、token、usage 未确认、最近来源均有断言                                                                     |

---

## 4. 验证结果

本机 PATH Node 21.5.0 不满足引擎要求；通过 bundled Node 24.21.0 + pnpm 11.7.0 执行：

```text
pnpm test
Test Files  18 passed (18)
Tests       55 passed (55)

pnpm typecheck   通过
pnpm lint        通过
pnpm format:check 通过
pnpm build       Next.js 16.4.2 生产构建通过
```

新增测试：

- `tests/session/stage-d.test.ts`（13）
- `tests/session/http-gateway.test.ts`（6）
- Stage C `tests/session/ai.test.ts`（9）回归
- Stage B `tests/session/service.test.ts`（4）回归

浏览器：

```text
pnpm test:browser
4 passed, 1 skipped
```

- key-storage：sessionStorage 生命周期。
- mode：enable → rotate → disable。
- ownership：外来 owner state/action/next/decision/mode 404。
- table：3 手、弃牌、刷新恢复、V03。
- rebuy：确定性 fixture 另行 1 passed。

证据：

- [Stage D 桌面](evidence/stage-d-table.png)
- [Stage D 移动端](evidence/stage-d-mobile.png)

---

## 5. 真实 API

- **调用：0 次。**
- **usage：无。**
- 未使用真实 Key；未调用 `/models` 或 `/chat/completions`。
- 真实模型 JSON 合规率、延迟、错误码、计费未联调。
- 离线测试使用 QueueGateway 和 fake `fetch`，不能冒充真实连通。

真实联调前置：用户提供 Key、明确小额请求范围、记录请求数/usage/失败类型。

---

## 6. 已知问题

1. **真实 API 未验证**：没有 Key/授权；不能声称已接通。
2. **提示词与四牌风真实质量未实测**：需要小样本联调调优。
3. **连接测试 `/models` 无 token usage**：计入请求/成功/失败，缺失 usage 标记未确认。
4. **统计仅内存会话**：进程重启丢失，符合单实例边界。
5. **测试 fixture 仍在生产源码**：仅非 production 生效。
6. **start requestId 幂等、限流、请求大小限制**未补齐。
7. **12 秒真实等待未测量**；只测试可控 timeout。
8. **公开行动解读**未实现，属 Stage E。
9. **S02 重启脚本未纳入 CI**。

不阻挡 Stage E 离线工作；真实联调另行授权。

---

## 7. 主要修改文件

- `src/server/bot-strategy/styles.ts`
- `src/server/bot-strategy/local.ts`
- `src/server/ai/bot-input.ts`
- `src/server/ai/prompt.ts`
- `src/server/ai/protocol.ts`
- `src/server/ai/validate.ts`
- `src/server/ai/gateway.ts`
- `src/server/ai/http-gateway.ts`
- `src/server/session/service.ts`
- `src/server/session/types.ts`
- `src/server/session/store.ts`
- `src/shared/api.ts`
- `src/app/page.tsx`
- `src/app/api/ai/test/route.ts`
- `tests/session/stage-d.test.ts`
- `tests/session/http-gateway.test.ts`
- `tests/session/ai.test.ts`（回归）
- `docs/plans/stage-d-report.md`
- `docs/evidence/stage-d-*.png`

---

## 8. Git

- Stage A：`c75c62a`
- Stage B：`59239ff`
- Stage C：`4813e14`
- Stage D：本轮完成后创建并推送；哈希见最终汇报。
- 不覆盖远端历史、不强推。

---

## 9. 下一步（Stage E）

1. 公开行动解读入口，绑定已提交 actionEventId，只使用动作时公开视图。
2. 移动布局、下注操作、连接/降级状态浏览器检查。
3. sessionStorage 刷新/关闭/恢复实测。
4. 单实例部署、启动、Key/费用说明、完整限制文档。
5. V02、K02 与 23 项验收矩阵逐条证据。

真实 API 联调仍单独需要用户 Key 与明确小额范围。
