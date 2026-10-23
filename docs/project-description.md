# Poker AI 项目描述与检索说明

本文提供可直接用于 GitHub 仓库 About、Topics、README 和分享卡片的描述文案，目标是让搜索“德州扑克”“本地德州扑克”“德州扑克与 AI”“AI 德州扑克”“DeepSeek 德州扑克”等词的用户更容易找到本仓库。

> GitHub 搜索排序没有排名保证。本文做的是字段覆盖和内容可发现性优化，不代表一定排在搜索结果首页。仓库的 star、活跃度、外部链接和账号权重仍会影响排序。

---

## 1. GitHub About（直接复制）

建议仓库右上角 About 使用：

> 本地运行的德州扑克与 AI 实验项目：五人桌无限注德州扑克，四名机器人可选本地策略或自带 DeepSeek Key 决策；含规则引擎、并发控制、来源/用量统计与公开行动解读。无需 Key 可玩。Next.js + TypeScript。

英文备选：

> Local-first five-seat No-Limit Texas Hold'em with four AI opponents, optional BYOK DeepSeek decisions, a TypeScript rule engine, concurrency control and public action insights. Playable without a key.

说明：

- 中文 About 覆盖“德州扑克 + 本地 + AI + DeepSeek + Next.js”核心检索词。
- 不写“已上线”“真实 API 已验证”等不实描述。
- 当前真实 DeepSeek 联调尚未执行，仓库内文档和 README 都明确标注。

---

## 2. GitHub Topics（建议设置）

在仓库 **About → Topics** 添加：

```text
texas-holdem
poker
poker-ai
ai
deepseek
nextjs
typescript
react
local-first
browser-game
byok
single-player
game-engine
llm
tailwindcss
```

可选补充：

```text
no-limit
playwright
vitest
```

Topics 使用英文小写和连字符；中文检索主要由 README、About 和仓库内容承担。

---

## 3. 中文项目简介（可作 README 开头/分享文案）

**Poker AI V3.2** 是一个可以在自己电脑上运行的五人桌无限注德州扑克与 AI 实验项目。它把服务端裁决、五座位牌桌、本地机器人、DeepSeek BYOK 决策、并发控制和公开行动解读放在同一个可运行项目里，适合想研究“德州扑克与 AI 如何结合”的开发者、学习者和扑克爱好者。

如果你在找这些方向，本仓库就是为此准备的：

- **本地德州扑克 / 单机德州扑克**：不依赖云端账号和数据库，Node.js 进程内即可开桌。
- **德州扑克 AI / AI 德州扑克**：四名机器人有不同牌风；不填 Key 用本地策略，填入自己的 DeepSeek Key 后可走智能决策链路。
- **德州扑克与 AI 工程实践**：包含规则引擎适配、服务端 DTO、防重复决策、幂等、超时/重试、JSON 校验、本地降级和 token/usage 统计。
- **浏览器德州扑克**：Next.js + React + TypeScript + Tailwind CSS，桌面和移动端浏览器可操作。
- **DeepSeek 德州扑克**：Key 仅按请求转发，不保存到游戏 Session；真实 API 仍需用户自行提供 Key 后联调。

这是一个**本地验收版本**，不是已经公开上线的线上产品，也不能声称真实 DeepSeek API 已验证。

---

## 4. 搜索意图覆盖

| 用户搜索词              | 仓库能提供的对应内容                                        |
| ----------------------- | ----------------------------------------------------------- |
| 德州扑克                | 五人桌无限注德州扑克、规则引擎、行动/结算/边池/胜率牌型测试 |
| 本地德州扑克            | 本地 Node.js + 浏览器运行；无需云端账号/数据库              |
| 单机德州扑克            | 单人对四名电脑；本地策略无需 Key                            |
| 德州扑克与 AI           | 四牌风机器人、模型决策链路、受控模型替身测试                |
| AI 德州扑克             | LLM/DeepSeek 决策、JSON 校验、超时、重试、本地降级          |
| DeepSeek 德州扑克       | BYOK Key、`deepseek-flash`、非思考模式、用量统计            |
| 浏览器德州扑克          | Next.js/React 页面；桌面与 390px 移动端验收                 |
| 德州扑克源码 / 项目示例 | TypeScript 全栈、规则测试、Playwright 浏览器测试            |
| 德州扑克 AI 隐私        | 单机器人公开视图、替换隐藏牌不影响输入、公开行动解读        |

---

## 5. 项目实际功能

### 牌桌与规则

- 五人桌，固定 5/10 盲注，1,000 起始筹码。
- 服务端权威裁决；支持翻前/翻牌/转牌/河牌/摊牌。
- 大盲选项、短全下、累计短全下重开、边池、未跟注退回、平局零头。
- 手间自动补码；真人可显式补码。
- 匿名 HttpOnly owner Cookie；单实例内存会话，30 分钟空闲 TTL。

### 四名机器人

| 机器人 | 牌风                                 |
| ------ | ------------------------------------ |
| AI-1   | 紧弱，保守参与，面对压力更易退出     |
| AI-2   | 松凶，宽范围，主动施压               |
| AI-3   | 相对均衡，综合位置、价格和牌面       |
| AI-4   | 观察当前手公开动作，不做跨手学习承诺 |

本地模式无需 Key；智能模式需要用户自己的 DeepSeek Key。

### DeepSeek 决策链路

- 固定上游 `https://api.deepseek.com`，模型 `deepseek-flash`。
- 显式非思考模式，输出上限 800 tokens，节点总预算 12 秒。
- 429/网络/5xx 最多重试一次。
- 结构化 JSON、动作、金额、合法动作、意图目标校验。
- 非法建议不执行，回退本地策略。
- 来源标记：`deepseek`、`local_no_key`、`local_fallback`。
- 统计请求、成功、失败、拒绝、重试、token；缺失 usage 标为“未确认”。

### 公开行动解读

- 机器人已提交动作后可点击“思路”。
- 只读动作发生时的公开快照：公共牌、底池、公开投入、动作、街道等。
- 不读取私有底牌、牌堆、模型摘要、confidence 或 opponent intents。
- 首版为独立模板，不额外调用模型。
- 面板明确说明：不代表真实手牌或完整内部决策理由。

### Key 生命周期与并发

- Key 仅保存在当前标签页 `sessionStorage`。
- 用户主动测试连接；可清除、更换、停用。
- `aiEpoch` 与 PendingDecision：同一回合最多一个逻辑决策流程。
- 旧 epoch/旧 decisionId 响应不能提交，不能清除新预留。
- 刷新先同步状态；在途决策不重复付费创建。

---

## 6. 技术栈与目录

- Node.js >= 24.15.0
- pnpm 11.7.0
- Next.js 16.4.2
- React 19
- TypeScript 5.9
- Tailwind CSS 4
- Vitest 3
- Playwright 1.64
- `@pokertools/engine` 规则引擎

核心目录：

```text
src/app/            页面与 API routes
src/server/engine/  规则引擎适配与公开视图
src/server/ai/      模型输入、提示词、协议、校验与上游适配
src/server/insight/ 动作时公开快照与公开解读模板
src/server/session/ 会话、版本、epoch、pending、并发
src/shared/         共享 DTO 与 API 类型
tests/              规则、会话、AI 与浏览器测试
docs/               规范、验收、部署和进度文档
```

---

## 7. 本地启动

```bash
pnpm install --frozen-lockfile
pnpm dev
# http://127.0.0.1:3000
```

生产式本地启动：

```bash
pnpm build
pnpm start -- -H 127.0.0.1 -p 3000
```

必须保持**单实例、单 Node.js 进程**；会话在内存中，进程重启会丢失。公开部署前还需要 HTTPS、代理脱敏、限流和容量验证，见 [deployment.md](deployment.md)。

---

## 8. 测试与验收

实际执行：

```text
pnpm test             19 文件 / 59 测试通过
pnpm test:browser     7 passed, 1 skipped
rebuy fixture         1 passed
pnpm typecheck        通过
pnpm lint             通过
pnpm format:check     通过
pnpm build            通过
```

23 项验收矩阵见 [acceptance-matrix.md](acceptance-matrix.md)。

说明：

- **K02 部分通过**：刷新保留 sessionStorage；关闭后新标签页为空；浏览器恢复关闭标签页由浏览器决定，未自动化。
- **真实 DeepSeek API 未调用、未验证**，请求次数 0，usage 无。
- 模型决策链路由可控模型替身测试覆盖，不等于真实上游已连通。

---

## 9. 隐私、费用与边界

- Key 不进入 URL、公开 body、游戏 Session、数据库或普通日志。
- `sessionStorage` 在正常关闭标签页时通常清除，但浏览器恢复会话可能恢复；页面不承诺一定为空。
- 调用费用由用户自己的 DeepSeek 账户承担；连接测试也可能产生少量用量。
- 单实例内存会话，无账号、数据库、真人多人、排行榜或跨手学习。
- 当前公开行动解读是固定安全模板，不读取模型私有理由。
- 未公开部署；公开部署是单独操作。

---

## 10. GitHub 设置清单

1. About 使用 §1 文案，确认不超过 350 字符。
2. Topics 添加 §2 的英文标签。
3. README 使用中文简介（已补齐）并保留局限说明。
4. 仓库 Social preview 可使用牌桌截图：`docs/evidence/stage-e-insight.png`。
5. 可选：在仓库主页添加 Releases / 运行截图，但不要用占位页面替代真实可运行代码。
6. 外部分享时使用自然描述，不堆砌关键词，不写“已上线”“真实 API 已验证”。

建议分享文案：

> 一个可本地运行的五人桌德州扑克 AI 实验项目：不填 Key 也能玩，填入自己的 DeepSeek Key 可体验四牌风模型决策；包含规则引擎、并发控制、用量统计与公开行动解读。

---

## 11. 不应使用的表述

避免：

- “已上线 / 在线体验”而未实际部署。
- “真实 DeepSeek 已验证 / 已连通”而未联调。
- “开源”而没有明确 LICENSE；当前仓库公开可查看，但不应自行宣称 OSI 开源许可。
- “保证搜到 / 排名第一”等搜索承诺。
- “每局只调用四次模型”“完全免费”等费用承诺。
