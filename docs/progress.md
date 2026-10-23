# Poker AI — 项目进度

- 当前阶段：**Stage E 本地交付完成；K02 浏览器恢复标签页为部分通过；真实 DeepSeek API 未验证**
- 本轮日期：2026-10-22
- 目标目录：`F:\code\PokerAI`
- Git 远端：`https://github.com/godorjes/PokerAI.git`
- 本轮性质：公开行动解读、actionEventId 绑定、公开快照、模板说明、移动端/浏览器验收、sessionStorage 生命周期、部署说明
- 真实 DeepSeek 请求：**0 次**；usage：**无**

---

## 1. 本轮结论

- 新增公开行动解读：每名已行动机器人显示“思路”按钮，绑定已提交的 actionEventId。
- 解读只使用动作发生前的公开快照（公共牌、底池、公开投入/动作等），不读取机器人底牌、牌堆、私有 decisionSummary、confidence 或 opponent intents。
- 首版使用独立模板，不调用模型；面板固定说明“基于公开信息的行动解读，不代表真实手牌或完整内部决策理由”。
- S01 扩展至 `/api/ai/insight`：外来 owner 404。
- 移动端 390px 检查：无横向滚动，实际提交加注，显示本地降级来源。
- K02：刷新保留 sessionStorage；关闭后新标签页为空；浏览器恢复关闭标签页为浏览器行为，未自动化。
- S02：停进程→重启后刷新，页面显示“原牌桌会话已过期或服务端已重启”，本轮有截图。
- 23 项验收矩阵已逐条记录：`docs/acceptance-matrix.md`。
- 单实例部署/启动/Key/费用/限制说明：`docs/deployment.md`。
- 真实 API 仍未调用、未验证。

详细记录：[stage-e-report.md](plans/stage-e-report.md)。

---

## 2. 实际实现

### 2.1 公开快照

新增：

- `src/server/insight/types.ts`
- `src/server/insight/capture.ts`
- `src/server/insight/template.ts`

`PublicActionSnapshot` 只保存：

- actionEventId、手牌编号（handId）、座位/玩家、公开显示名。
- 动作、amountTo、实际 chipsMoved。
- 街道、动作前公共牌、动作前底池、动作后底池/筹码。
- 按钮位、大盲位。

不保存：底牌、牌堆、私有摘要、confidence、opponent intents、模型原文/finish_reason。

`PokerTable.act` 的 actionEventId 改为与公开 action log 一致的稳定 ID；uncalled return 不覆盖实际动作 ID。

### 2.2 Insight API

新增 `GET /api/ai/insight`：

- 参数：gameId、handId、actionEventId。
- 校验 owner；未绑定动作/旧手返回 404。
- 响应 `no-store`。
- 不触发模型，不返回私有字段。

### 2.3 前端入口

`src/app/page.tsx`：

- 每名已行动机器人座位显示“思路”按钮。
- 弹出“公开行动解读”面板；包含固定说明、公开文本、绑定 actionEventId、街道、模板来源。
- 机器人底牌和私有摘要不进入面板。
- 新牌桌/下一手关闭旧解读。

### 2.4 浏览器与交付

- `tests/browser/insight.spec.ts`
- `tests/browser/mobile.spec.ts`
- `tests/browser/session-storage.spec.ts`
- `tests/browser/ownership.spec.ts`（insight 404）
- `docs/acceptance-matrix.md`
- `docs/deployment.md`

---

## 3. 验收覆盖

| 编号      | 状态         | 证据                                                                   |
| --------- | ------------ | ---------------------------------------------------------------------- |
| V02       | **通过**     | `tests/session/insight.test.ts`：替换私有底牌/摘要，快照和模板不变     |
| K02       | **部分通过** | 刷新保留、关闭后新标签页为空；浏览器恢复标签页未自动化，不承诺必定为空 |
| S01       | **通过**     | `tests/browser/ownership.spec.ts`：insight 外来 owner 404              |
| S02       | **通过**     | 本轮重启证据 `docs/evidence/stage-e-expired.png`                       |
| V03       | **通过**     | `tests/session/insight.test.ts` + `tests/browser/table.spec.ts`        |
| 23 项矩阵 | 已逐条记录   | `docs/acceptance-matrix.md`                                            |

---

## 4. 验证结果

本机通过 bundled Node 24.21.0 + pnpm 11.7.0 执行：

```text
pnpm test
Test Files  19 passed (19)
Tests       59 passed (59)

pnpm test:browser
7 passed, 1 skipped

rebuy fixture
1 passed

pnpm typecheck   通过
pnpm lint        通过
pnpm format:check 通过
pnpm build       Next.js 16.4.2 生产构建通过
```

浏览器实际走查：

- 公开解读按钮/面板/绑定 actionEventId。
- 390px 无横向溢出；下注/加注控制；实际加注。
- 无 Key 状态与本地降级来源。
- sessionStorage 刷新/新标签页。
- 三手、弃牌、刷新恢复、补码。
- S02 停进程重启过期提示。

证据：

- [公开解读](evidence/stage-e-insight.png)
- [Stage E 桌面](evidence/stage-e-table.png)
- [Stage E 移动端](evidence/stage-e-mobile.png)
- [重启过期提示](evidence/stage-e-expired.png)

---

## 5. 真实 API

- **调用：0 次。**
- **usage：无。**
- 未使用真实 Key；未调用 `/models` 或 `/chat/completions`。
- 公开解读不调用模型。
- 真实模型质量、JSON 合规率、延迟、计费未联调；不能把离线测试当作真实连通。

---

## 6. 已知问题

1. **真实 API 未验证**：没有 Key/授权。
2. **K02 浏览器恢复关闭标签页未自动化**：只部分通过；文案不承诺一定恢复/为空。
3. **公开解读是固定模板**：不使用模型私有摘要，这是首版安全边界。
4. **S02 过期流程不是常规 CI**：本轮实际执行并留证。
5. **sessionStorage 被禁用时无显式 UI 提示**。
6. **start requestId 幂等、应用层限流/请求体限制**未补。
7. **测试 fixture 仍在生产源码**：仅非 production 生效。
8. **真实移动设备/Safari/Firefox 未检查**；本轮为 Chrome 390px。
9. **公开部署未执行**：只提供本地构建/启动说明，不冒充上线。

不阻挡本地交付；公开部署和真实 API 联调是单独操作。

---

## 7. 主要修改文件

- `src/server/insight/types.ts`
- `src/server/insight/capture.ts`
- `src/server/insight/template.ts`
- `src/app/api/ai/insight/route.ts`
- `src/app/page.tsx`
- `src/server/session/service.ts`
- `src/server/session/types.ts`
- `src/server/session/store.ts`
- `src/server/engine/table.ts`
- `src/shared/api.ts`
- `src/server/session/errors.ts`
- `tests/session/insight.test.ts`
- `tests/browser/insight.spec.ts`
- `tests/browser/mobile.spec.ts`
- `tests/browser/session-storage.spec.ts`
- `tests/browser/ownership.spec.ts`
- `tests/browser/table.spec.ts`
- `docs/acceptance-matrix.md`
- `docs/deployment.md`
- `docs/plans/stage-e-report.md`
- `docs/evidence/stage-e-*.png`

---

## 8. Git

- Stage A：`c75c62a`
- Stage B：`59239ff`
- Stage C：`4813e14`
- Stage D：`f1ffe55`
- Stage E：本轮完成后创建并推送；哈希见最终汇报。
- 不覆盖远端历史、不强推。

---

## 9. 下一步

本地交付已完成。紧接着的外部步骤：

1. 用户提供 Key 和明确小额范围后，做真实 DeepSeek 小样本联调，记录请求/usage/失败。
2. 公开部署单独配置 HTTPS、单实例常驻、代理脱敏、限流/体积限制和容量验证。
3. 如继续开发，再补 start 幂等、rate limit、sessionStorage 禁用提示和移动真机测试。
