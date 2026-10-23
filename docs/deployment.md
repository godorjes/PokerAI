# 部署与运行说明

本文是 Poker AI V3.2 首版的本地/单实例运行说明，不是公开部署已经完成的证明。

## 1. 运行要求

- Node.js `>= 24.15.0`；本项目实际验收使用 Node 24.21.0。
- pnpm `11.7.0`。
- 一个 Node 进程、一个实例。不要部署成 Serverless、多进程或多副本。
- 服务端会话保存在该进程内存中；进程重启/发布/内存丢失后旧牌桌不可恢复。
- 首次安装：

```bash
pnpm install --frozen-lockfile
```

## 2. 本地开发

```bash
pnpm dev
# http://127.0.0.1:3000
```

浏览器刷新会尝试用 localStorage 中的 gameId 和 HttpOnly owner Cookie 恢复同一内存会话；会话空闲 30 分钟后过期。页面会提示重新开桌。

## 3. 生产构建与本地启动

```bash
pnpm build
pnpm start -- -H 127.0.0.1 -p 3000
# http://127.0.0.1:3000
```

`pnpm start` 只是 Next.js 生产服务器，不自动提供 TLS、反向代理、限流或持久化。

## 4. 单实例约束

必须保持：

- 一个常驻 Node 进程。
- 不做请求级隔离/多实例负载均衡。
- 不把 `GameService` 内存状态搬到无法共享的进程外。
- 不在生产环境设置 `POKER_STAGE_B_TEST_TABLE=1`；该 fixture 是测试专用且仅非 production 生效。

需要跨重启恢复、水平扩容或多人共享牌桌时，要先引入共享会话/状态存储，属于另一个架构阶段。

## 5. 网络与安全前置

本地验收已经使用匿名 HttpOnly owner Cookie、同源写请求检查和归属校验。公开部署前仍需在反向代理/平台层补：

- HTTPS；生产 Cookie 的 `Secure` 依赖 HTTPS。
- 请求体大小限制和请求速率限制。
- 访问日志/代理日志/错误上报的 Key 与提示词脱敏。
- CSP 与安全响应头。
- 限制会话总数；当前代码有内存上限和 30 分钟空闲 TTL，但未按生产容量压测。
- 不记录含 Key 的请求头、请求体、提示词或原始模型响应。

任何代理或日志系统都不得把 `x-deepseek-api-key` 写入可访问日志。

## 6. DeepSeek Key 与费用

- Key 由用户在页面填写，默认只保存在当前标签页 `sessionStorage`。
- Key 不写入游戏 Session、URL、公开响应或数据库。
- `/api/ai/test` 与 `/api/ai/decision` 只在本次请求中转发 Key 到固定上游 `https://api.deepseek.com`。
- 调用费用由用户自己的 DeepSeek 账户承担；本项目不提供平台统一 Key。
- 连接测试也可能产生少量上游用量。
- 同一机器人同一下注轮可能多次行动；不要用“每局固定四次”估算费用。
- 页面显示本桌请求、成功、降级、拒绝、重试和 token；用量缺失标为“未确认”。

## 7. 当前限制

- 真实 DeepSeek API **未验证**：没有用户 Key 和授权预算，不能声称已连通。
- 四牌风真实模型质量、JSON 合规率、延迟和费用率未实测。
- 没有数据库、账号、排行榜、跨手学习或真人多人。
- `start` 的 requestId 幂等、请求体大小限制、请求速率限制尚未在应用层实现。
- sessionStorage 在禁止存储的浏览器中会退化为页面内存；当前 UI 没有单独的显式提示。
- 浏览器“恢复关闭的标签页”是否恢复 sessionStorage 取决于浏览器；正常关闭/新开标签页不保证保留。
- 公开行动解读使用独立模板，不调用模型；不读取私有 `decisionSummary`、底牌或意图。
- `/api/ai/insight` 只对已提交绑定当前手的 actionEventId 返回 404/说明，不触发模型。

## 8. 验收命令

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build
pnpm test:browser       # 需要 127.0.0.1:3000 dev server
```

确定性补码验收：

```bash
# 终端 A
POKER_STAGE_B_TEST_TABLE=1 pnpm dev
# 终端 B
POKER_TEST_REBUY=1 pnpm test:browser
```

Windows PowerShell 的等价设置由本轮验证脚本实际使用；fixture 不得用于生产。
