# V3.2 验收矩阵（23 项）

- 验收日期：2026-10-22
- 自动测试：`pnpm test` 与 `pnpm test:browser` 的实际结果见 `docs/progress.md` 与 `docs/plans/stage-e-report.md`
- **真实 DeepSeek API：未调用、未验证**
- 状态含义：通过 = 有自动测试或可复现实测；部分通过 = 已覆盖可测部分但存在明确未测边界。

| 编号 | 状态     | 场景与证据                                                                                                                                                     |
| ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G01  | 通过     | 大盲投入/加注金额；`tests/rules/g01-amount-to.test.ts`                                                                                                         |
| G02  | 通过     | 短全下不重开；`tests/rules/g02-short-allin-no-reopen.test.ts`                                                                                                  |
| G03  | 通过     | 累计完整增量重开；`tests/rules/g03-cumulative-short-allin-reopen.test.ts`                                                                                      |
| G04  | 通过     | 主池/边池/未跟注退回；`tests/rules/g04-side-pots-uncalled.test.ts`                                                                                             |
| G05  | 通过     | 多池分配；`tests/rules/g05-side-pot-payout.test.ts`                                                                                                            |
| G06  | 通过     | 大盲选项；`tests/rules/g06-big-blind-option.test.ts`                                                                                                           |
| G07  | 通过     | 短全下后继续行动；`tests/rules/g07-allin-continue-betting.test.ts`                                                                                             |
| G08  | 通过     | 弃牌获胜/平局零头；`tests/rules/g08-fold-win-and-tie-odd-chip.test.ts`                                                                                         |
| G09  | 通过     | 牌型/踢脚/公共牌最佳；`tests/rules/g09-hand-ranking.test.ts`                                                                                                   |
| G10  | 通过     | 手间补码；`tests/session/service.test.ts`                                                                                                                      |
| G11  | 通过     | 短 BB bring-in；`tests/rules/g11-short-bb-bringin.test.ts`                                                                                                     |
| A01  | 通过     | 四 seat 各两种合法模型结果，实际动作改变；`tests/session/stage-d.test.ts`                                                                                      |
| A02  | 通过     | 非法动作/金额、Key 错误、超时、空 JSON/截断、重试；`tests/session/stage-d.test.ts`、`tests/session/http-gateway.test.ts`                                       |
| A03  | 通过     | 同回合重复触发只创建一个流程；`tests/session/ai.test.ts`                                                                                                       |
| A04  | 通过     | rotate/disable 后旧响应不能提交；`tests/session/ai.test.ts`                                                                                                    |
| V01  | 通过     | 替换他人隐藏牌和剩余牌堆，机器人输入不变；`tests/session/stage-d.test.ts`                                                                                      |
| V02  | 通过     | 固定公开动作/替换私有底牌与摘要，快照和模板输出不变；`tests/session/insight.test.ts`                                                                           |
| V03  | 通过     | 机器人弃牌/行动后的网络响应不含其底牌、牌堆、私有摘要；`tests/session/insight.test.ts` + `tests/browser/table.spec.ts`                                         |
| K01  | 通过     | 两个 owner 的测试/决策 Key 隔离；`tests/session/ai.test.ts`                                                                                                    |
| K02  | 部分通过 | 刷新保留 sessionStorage；正常关闭后新标签页不共享；浏览器“恢复关闭标签页”为浏览器自身行为，未自动化，不承诺恢复后为空。`tests/browser/session-storage.spec.ts` |
| K03  | 通过     | 在途 decision 时 disable 使旧结果失效；`tests/session/ai.test.ts`                                                                                              |
| S01  | 通过     | 外来 owner 对 state/action/next/decision/mode/insight 全部 404；`tests/browser/ownership.spec.ts`                                                              |
| S02  | 通过     | 有效会话刷新恢复；停进程→重启后刷新显示“原牌桌会话已过期或服务端已重启”；`docs/evidence/stage-e-expired.png`，Stage B 证据 `docs/evidence/stage-b-expired.png` |

## K02 实测记录

1. 同标签页写入 `sessionStorage` 后刷新：Key 仍在当前标签页。
2. 关闭该页面，在同一浏览器 context 新开页面：新页面 `sessionStorage` 为空。
3. 浏览器“恢复关闭的标签页”行为由浏览器决定，当前未自动化实测；页面文案没有承诺恢复后一定为空。

## 说明

- V02 的“公开解读输入”是 `PublicActionSnapshot`，只含动作时公开状态和动作字段。
- V03 的网络响应检查不包含底牌/牌堆/私有摘要字段。
- 所有模型替身测试都是离线验证；真实模型质量、JSON 合规率和费用未联调。
