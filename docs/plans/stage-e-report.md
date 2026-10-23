# Stage E — 公开行动解读与交付验收 记录

- 日期：2026-10-22
- 状态：**Stage E 本地交付完成；K02 的浏览器“恢复关闭标签页”为部分通过；真实 DeepSeek API 未验证**
- 自动化：19 文件 / 59 单元测试；浏览器常规套件 7 passed / 1 skipped；补码 fixture 1 passed
- 真实 API：**0 次请求，无 usage**

---

## 1. 实际实现

### 1.1 公开行动解读

新增：

- `src/server/insight/types.ts`
- `src/server/insight/capture.ts`
- `src/server/insight/template.ts`
- `src/app/api/ai/insight/route.ts`
- `src/shared/api.ts` 的 `PublicInsightResponse`

实现行为：

- 机器人动作提交时，在 `PokerTable.act` 之前捕获公开状态，动作提交后捕获 `ActionEvent`。
- `PublicActionSnapshot` 只保存：actionEventId、座位/玩家、动作/金额、街道、动作前公共牌、底池、按钮/大盲、动作后底池/筹码。
- 不保存机器人底牌、牌堆、私有 `decisionSummary`、confidence、opponent intents 或模型原文。
- 模板首版独立生成，不调用模型。
- `GET /api/ai/insight?gameId=&handId=&actionEventId=`：
  - 校验 owner；
  - 只返回绑定当前手已提交动作的快照；
  - 未绑定/旧手返回 404；
  - 响应 `Cache-Control: no-store`。
- actionEventId 与公开 action log 使用同一稳定 ID。

### 1.2 前端“思路”入口

`src/app/page.tsx`：

- 每名已行动机器人的座位显示“思路”按钮。
- 点击后请求 insight，显示“公开行动解读”。
- 面板固定说明：
  > 基于公开信息的行动解读，不代表真实手牌或完整内部决策理由。
- 展示动作文本、绑定 actionEventId、街道和“模板生成”。
- 不展示私有摘要或私有意图。
- 新一手/新牌桌关闭旧解读。

### 1.3 交付检查

- 移动端 390×844 检查：无横向滚动；下注/加注输入与按钮可用；实际提交加注并看到动作记录。
- 连接/降级状态：无 Key 显示未配置；本地动作显示“本地（无 Key）”。
- sessionStorage：刷新保留；关闭后新标签页为空（K02 的浏览器恢复标签页边界见 §3）。
- S02：停进程→重启后刷新，页面显示“原牌桌会话已过期或服务端已重启”，不恢复旧局。
- 单实例部署、Key/费用/限制说明：`docs/deployment.md`。

---

## 2. 规范覆盖

- **6**：公开行动解读入口、公开信息说明、actionEventId 绑定、动作时快照、不读取私有 reason。
- **4.2/4.4**：公开解读仅使用公开视图；不泄露私有底牌/摘要。
- **8.4**：Key 面板统计、来源、usage 未确认继续显示。
- **10**：`GET /api/ai/insight`。
- **12 验收矩阵**：逐项见 `docs/acceptance-matrix.md`。
- **V02**：通过。
- **K02**：部分通过（见 §3）。
- **S01**：insight 加入外来 owner 404 检查。
- **S02**：通过（当前重启证据）。
- Stage A/B/C/D 回归通过。

---

## 3. K02 实测边界

实测：

1. 同标签写入 sessionStorage → 刷新：保留。
2. 关闭当前页面 → 同 context 新标签页：sessionStorage 为空。
3. 页面文案不承诺“恢复关闭标签页后必定为空”。

未自动化：

- 浏览器自身的“恢复关闭的标签页”行为。该行为由浏览器决定，可能是恢复也可能为空；项目不承诺具体结果。

因此 K02 标为**部分通过**，而不是全通过。

---

## 4. 验证结果

```text
pnpm test
Test Files  19 passed (19)
Tests       59 passed (59)

pnpm test:browser
7 passed, 1 skipped

rebuy fixture:
1 passed

pnpm typecheck   通过
pnpm lint        通过
pnpm format:check 通过
pnpm build       Next.js 16.4.2 生产构建通过
```

关键浏览器测试：

- `tests/browser/insight.spec.ts`：点击“思路”，面板绑定已提交动作，公开说明可见。
- `tests/browser/mobile.spec.ts`：390px 无横向溢出，提交加注，显示本地降级来源。
- `tests/browser/session-storage.spec.ts`：刷新保留 / 新标签页为空。
- `tests/browser/ownership.spec.ts`：insight 外来 owner 404。
- `tests/browser/table.spec.ts`：三手、弃牌、刷新恢复。

证据：

- [公开解读面板](../evidence/stage-e-insight.png)
- [Stage E 桌面](../evidence/stage-e-table.png)
- [Stage E 移动端](../evidence/stage-e-mobile.png)
- [服务端重启后的过期提示](../evidence/stage-e-expired.png)
- [Stage B 过期证据](../evidence/stage-b-expired.png)

---

## 5. 真实 API

- **未调用真实 DeepSeek API。**
- **请求次数：0。**
- **usage：无。**
- 未使用真实 Key；公开解读不调用模型。
- 真实模型质量、JSON 合规率、延迟、计费未验证；不能把离线测试当成已连通。

---

## 6. 已知问题

1. **真实 API 未验证**：无 Key/授权；生产上游兼容性未测。
2. **K02 浏览器恢复关闭标签页未自动化**：部分通过，文案不承诺必定恢复/必定为空。
3. **公开解读是固定模板**：不根据模型私有摘要生成；这是首版安全限制。
4. **S02 过期/重启浏览器流程不是常规 CI 测试**；本轮已实际执行并留证。
5. **sessionStorage 被禁用时无显式 UI 提示**：仅退化为页面内存。
6. **start requestId 幂等、应用层限流/请求体大小限制**仍需补。
7. **测试 fixture 仍在生产源码**：仅非 production 生效。
8. **真实移动设备/Safari/Firefox 未检查**；本轮为 Chrome 390px 模拟。
9. **公开部署未执行**：本地构建/启动说明已提供，不冒充已上线。

不阻挡本地交付；公开部署和真实 API 联调是单独操作。

---

## 7. 交付文件

新增/修改：

- `src/server/insight/{types,capture,template}.ts`
- `src/app/api/ai/insight/route.ts`
- `src/app/page.tsx`
- `src/server/session/service.ts`
- `src/server/session/types.ts`
- `src/server/session/store.ts`
- `src/server/engine/table.ts`（稳定 actionEventId）
- `src/shared/api.ts`
- `tests/session/insight.test.ts`
- `tests/browser/{insight,mobile,session-storage}.spec.ts`
- `tests/browser/ownership.spec.ts`
- `docs/deployment.md`
- `docs/acceptance-matrix.md`
- `docs/evidence/stage-e-*.png`

---

## 8. 下一步

本轮不宣称项目已公开上线。紧接着的外部步骤：

1. 如用户提供 Key 和明确小额范围，做真实 DeepSeek 小样本联调并记录请求/usage/失败。
2. 公开部署需要单独配置 HTTPS、单实例常驻、代理脱敏、限流/体积限制和容量验证；不能用占位页面冒充。
3. 若继续产品开发，再补 start 幂等、rate limit、sessionStorage 禁用提示和移动真机测试。
