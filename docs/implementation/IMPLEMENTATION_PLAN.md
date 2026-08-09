# MorphFlow MVP 实施总计划

> 状态：Ready to execute<br>
> 日期：2026-08-09<br>
> 决策：A · 电影剪辑工作台；TypeScript/Node 单栈；不使用 Python<br>
> 依据：[PRD](../MorphFlow-PRD.md) · [技术设计](../TECHNICAL_DESIGN.md) · [UI 计划](./UI_COMPONENT_PLAN.md) · [安全测试计划](./SECURITY_TEST_PLAN.md) · [模型矩阵](../research/DMXAPI_MODEL_MATRIX.md)

## 1. 执行原则

1. 先交付无付费、可运行、可视觉验收的工作台，再接本地数据和真实模型。
2. UI、服务端校验、计价和 adapter 共用同一 capability 定义，不能在页面里写模型特判。
3. 原始素材不覆盖；真实 API Key 不进入 Git、SQLite、浏览器存储、日志或测试。
4. 已提交任务可以自动轮询，可能扣费的创建请求在结果不明时不得自动重提。
5. 每个阶段都以新鲜测试和凭据扫描作为完成证据，不把文档状态当成实现状态。
6. 当前不推送 GitHub；每次本地提交前先审查跟踪文件和敏感模式。

## 2. 协作安排

最多使用三个内部子任务并行，用户只需跟主任务沟通。主任务负责架构、冲突裁决、集成、测试和提交。

| 工作流 | 可独立内容 | 不可越界内容 |
|---|---|---|
| UI | 工作台壳、预览、素材条、检查器展示组件 | 不写 provider、Keychain、数据库 |
| 模型系统 | capability 类型、fixture、约束、费用合同 | 不写 React 视觉样式或真实网络 transport |
| 质量安全 | 测试工具、mock、脱敏/路径/状态机用例 | 不放宽验收，不接触真实 Key |
| 主任务 | 基础配置、共享合同、合并、服务端边界、最终验证 | 不把未审查的并行产出直接合入 |

共享基础文件（`package.json`、锁文件、TypeScript/Next 配置、数据库 schema、全局样式）只由主任务修改，避免并发覆盖。子任务只编辑预先分配的目录；完成后由主任务查看真实 diff、运行测试并决定是否采纳。

## 3. 阶段 0：运行与仓库基线

目标：形成可复现、无秘密、能启动的 Next.js 16 项目。

任务：

- 固定 Node.js 24 LTS、pnpm 与确切依赖版本，提交 lockfile。
- 建立 Next.js App Router、TypeScript、Tailwind、ESLint、Vitest、Testing Library 与 Playwright 基础。
- 设置 `server-only` 边界、路径别名、严格 TypeScript 和测试环境隔离。
- 保留当前 `.gitignore`；增加凭据扫描脚本和受控 fixture 目录。
- 提供 `dev`、`build`、`typecheck`、`lint`、`test`、`test:e2e`、`audit:secrets` 命令。
- 根路由进入 demo 工作台，不建立登录或营销页。

运行时策略：

- 项目支持 Node 24；不修改现有全局 Node 23 链接。
- 初始化期间可以使用独立的 Node 24 环境；最终本机启动必须验证 Keychain 和 FFmpeg 能访问宿主 macOS，不能依赖 Linux Docker 作为正式运行方式。
- 在 Node 24 验证完成前，不宣称运行基线通过。

验收：

- 新机器按 README 可以安装并启动。
- `build/typecheck/lint/test` 有实际命令且通过。
- 跟踪文件中无 Key、签名 URL、本地数据库、媒体或可视化临时文件。

## 4. 阶段 1：A 方案无付费工作台

目标：尽快交付用户可以在浏览器里实际操作的电影剪辑工作台。

任务顺序：

1. 设计 token、字体、全局背景、三栏 `WorkbenchShell`。
2. 顶栏健康状态、六区域 `CreativeRail` 和受限页面占位状态。
3. demo 项目、合成 A/B SVG 素材、中央 `MediaStage` 与 `A → B` 轨迹。
4. 素材胶片条、并排/擦除比较和键盘操作。
5. Paiwo ITV/ITV2 capability fixture。
6. 模式/模型双向筛选、输入槽位、动态字段和高级参数。
7. 跨字段约束、未知费用卡与无付费复核对话框。
8. 1100px 检查器抽屉、768px 受限浏览、reduced motion。

本阶段明确不接 SQLite、Keychain、FFmpeg 或外部 API。“最终提交”保持禁用并说明未连接后端。

验收：

- A/B、模式、模型、参数、约束和费用状态同屏可见。
- ITV 与 ITV2 切换会真实改变输入槽位和参数，而不是只改标题。
- 没有任何网络请求或付费行为。
- 1280px 无水平滚动，键盘可完成主要操作。

## 5. 阶段 2：模型注册表核心

目标：把 UI fixture 升级为可被服务端和 adapter 复用的版本化能力系统。

任务：

- 定义 `ModelModeDefinition`、input slot、field、constraint、pricing、evidence 和 maturity 类型。
- 编写纯函数：默认值、规范化、约束求值、输入绑定、费用快照和 client view model 投影。
- 第一批模式：Paiwo ITV/ITV2、Vidu 首尾帧、Kling 首帧/首尾帧。
- 第二批模式：H3 首尾帧/多模态、HappyHorse I2V/R2V、Kling 文生/多镜头。
- GPT Image 和 Gemini 使用同一证据状态，但分别属于 image/VLM category。
- 冲突字段保持 disabled 或 unknown，不用猜测填平：
  - Paiwo 认证、ITV2 价格、audio 结果和 negative prompt。
  - Vidu 查询 model name 与 audio 默认值。
  - GPT Image 三个不一致 model name。
  - Gemini 3.6 可用性、结构化输出和媒体限制。
  - Kling 首帧/首尾帧 4K 与主体字段冲突。

验收：

- 每个 capability 有 fixture 测试覆盖默认、枚举、范围、交叉约束和价格状态。
- Client 只收到 UI 所需 view model，不出现 endpoint、认证或原始文档内容。
- 注册表中 `documented` 不会被 UI 显示为“已实测”。

## 6. 阶段 3：SQLite 与本地素材

目标：把 demo 工作台变成可创建、关闭后恢复的本地项目。

任务：

- Drizzle + better-sqlite3、版本化 migration、WAL/foreign keys/busy timeout。
- 项目、素材、prompt revision、director run、generation draft、job/event/result/settings 表。
- 应用数据根目录和相对路径存储；媒体以 project/asset ID 组织。
- 流式图片/视频上传、魔数/大小/像素校验、SHA-256 与原子移动。
- ffprobe 元数据、视频预览与手动时间轴定位；FFmpeg 导出 PNG 作为派生 A。
- 原始素材与派生素材的 parent 关系和删除引用保护。

验收：

- 刷新和重启后项目、素材和草稿恢复。
- 路径穿越、符号链接逃逸、伪造 MIME、超限和中断上传被拒绝。
- 截帧不覆盖原视频，记录源哈希和时间码。
- SQLite/媒体错误不会产生“数据库成功但文件缺失”的可见资产。

## 7. 阶段 4：Keychain、任务系统与 mock provider

目标：在不接真实服务的情况下证明安全提交与异步恢复链路。

任务：

- macOS Keychain adapter 与内存 fake；设置页只显示配置状态/末四位。
- localhost Host/Origin/CSRF/Cookie 防护和安全响应头。
- 持久 job queue、单 Worker、lease/心跳、只追加事件和合法状态机。
- provider transport 接口、本地 mock server、统一错误和递归日志脱敏。
- 不可变费用确认：绑定 draft revision、registry version、参数和输入 hash。
- mock 创建 → task ID → polling → 下载 → 本地 asset + SHA-256。
- 已发送但响应不明时进入 `unknown`；只提供恢复，不自动重提。

验收：

- 刷新、重复点击、超时和 Worker 重启不会创建第二个付费语义 job。
- 完整 Key 在浏览器存储、页面、URL、SQLite、日志和错误中均检索不到。
- 查询/下载可安全退避重试；生成提交不盲目重试。
- E2E 在完全离线 mock 模式跑通主流程。

## 8. 阶段 5：GPT Image 与 Gemini 创作辅助

目标：接通两个可跳过的辅助模块，先用 mock，再做逐次真实验证。

GPT Image：

- 多参考图顺序和内部角色、原始提示词、AI 优化版本、最终人工编辑版本。
- multipart adapter；输出 URL/Base64 归一化为本地 image asset。
- 首版 `n=1`；mask 和未验证 model name 保持关闭。

Gemini：

- 结构化导演 Schema：摘要、镜头运动、时间线、连续性、风险和模型专用提示词。
- 文本/图片先行，视频理解在限制确认后开放。
- 解析失败保留脱敏响应并允许继续手写提示词。

验收：

- 两个模块均可完全跳过。
- 原始、优化、用户编辑和已用于生成的 prompt revision 不互相覆盖。
- 真实按钮只有在精确 model name、认证与价格验证后才开放。

## 9. 阶段 6：视频 Provider 适配器

按“业务核心 + 资料完整度 + 测试成本”排序：

1. Paiwo ITV：验证上传、单图提交、查询、下载。
2. Paiwo ITV2：验证双上传、首尾绑定、价格和音频差异。
3. Vidu Q3 首尾帧：重点确定 query model 和结构化状态。
4. Kling V3 首帧/首尾帧：先 std/pro，冲突解决后才开放 4K。
5. HappyHorse I2V/R2V：验证动态 1–9 参考图与 24 小时 ID/URL。
6. MiniMax H3：验证首尾帧与多模态互斥、2K 和成本。
7. Kling 多镜头与主体控制：作为复杂模式最后接入。

每个 adapter 都包含：请求映射 fixture、创建解析、查询状态映射、结果提取、错误分类和 mock 集成测试。React 组件不得出现供应商 endpoint 或原始 payload 特判。

## 10. 阶段 7：真实小额连通测试

该阶段才需要用户参与，并且每次调用单独批准：

1. 用户在本地设置页填写 Key；不通过聊天或文件发送。
2. 运行无付费或最低成本的模型可用性检查。
3. 界面显示模型、模式、输入数量、时长、分辨率、声音和预计费用。
4. 用户确认后只发一次创建请求。
5. 保存脱敏请求摘要、task ID、状态序列、耗时、成本状态和结果 hash。
6. 对照供应商账单核验价格、失败是否计费和结果 URL 有效期。

真实测试顺序：Gemini 最小文本/JSON → GPT Image 单张 → Paiwo 5 秒低分辨率无声 → 其余视频模型。

## 11. 测试与提交门禁

每个实现提交至少执行与改动相关的：

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit:secrets
```

涉及浏览器主流程时增加 `pnpm test:e2e`；涉及数据库/Worker/adapter 时增加对应 integration suite。

提交前必须检查：

- `git status --short`
- `git diff --check`
- `git diff --cached`
- 跟踪文件中的 Key、Bearer、Cookie、AWS/签名 URL 模式
- `message.md`、`.superpowers/`、数据库、媒体、日志是否仍被忽略

任何命令未实际运行或因 Node 24/依赖缺失受阻，都必须如实标记，不能写成通过。

## 12. 用户参与点

在真实 API 前，用户只需参与两次：

- 视觉验收首个可运行的 A 工作台，并指出创作路径上的不顺手之处。
- 本地填写 API Key、提供测试素材、逐次批准真实模型费用。

其余架构、实现拆分、fixture、测试、文档和本地提交由主任务驱动。

## 13. 下一次立即执行

1. 建立 Node 24 + Next.js 16 + TypeScript + Tailwind 的安全骨架。
2. 写第一批失败测试：根路由、Paiwo ITV/ITV2 capability 与跨字段约束。
3. 实现 A 方案工作台壳和本地合成素材。
4. 接入动态参数表单、未知费用和无付费复核。
5. 运行 lint、typecheck、unit、build、凭据扫描和桌面宽度截图检查。
6. 交付本地 URL 供用户实际体验，然后进入 SQLite/上传切片。
