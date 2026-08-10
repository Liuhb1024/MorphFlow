# MorphFlow

MorphFlow 是一个本地优先、个人使用的 AI 视频转场工作台。它把实拍视频尾帧、本地图片或手绘图、可选的 GPT Image 2 目标帧、可选的 Gemini 导演，以及多个图生视频/首尾帧模型组织成可控、可追溯的生成流程。

当前状态：新版本地 Studio 已可运行，包含项目、素材、生图、导演、视频生成、任务和设置七个页面。模型注册表提供 18 个独立 capability；真实付费提交仍然锁定，尚未调用任何模型，也尚未验证 DMXAPI 账户能力。

## 文档

- [产品需求文档](./docs/MorphFlow-PRD.md)
- [技术设计](./docs/TECHNICAL_DESIGN.md)
- [实施计划](./docs/implementation/IMPLEMENTATION_PLAN.md)
- [UI 组件计划](./docs/implementation/UI_COMPONENT_PLAN.md)
- [安全测试计划](./docs/implementation/SECURITY_TEST_PLAN.md)
- [DMXAPI 模型能力矩阵](./docs/research/DMXAPI_MODEL_MATRIX.md)

## 已实现

- Next.js 16 + React 19 的统一浅色创作工作台与七个主页面。
- Gemini、GPT Image 2、Kling、Vidu、MiniMax H3、HappyHorse、Paiwo 共 18 个 capability，保留各自输入、参数、约束和价格证据。
- 真实本地项目、镜头和素材 SQLite 仓储；项目支持搜索、重命名和带二次确认的完整删除，上传内容保存到仓库外的数据目录。
- 上传文件的 MIME、扩展名、魔数、大小、路径和符号链接安全校验。
- 设置页通过 macOS Keychain 保存/删除 DMXAPI Key，完整密钥永不回显。
- 只读健康检查：Node.js、SQLite、FFmpeg 和 ffprobe。
- 付费任务显式状态机，包含 `unknown` 人工恢复路径和只追加任务事件设计。
- SQLite WAL / 外键 / busy timeout 基础连接与 schema。
- macOS Keychain 安全适配器：密钥经标准输入传递，不进入命令参数、数据库或日志。
- 递归日志脱敏、凭据扫描、单元测试和浏览器端到端测试。

首次无素材时会显示合成 SVG 作为明确标注的演示画面；上传图片后，素材页和生成页改用真实本地素材。GPT Image 2、VLM 导演、DMXAPI 提交/轮询与导出，会在接口文档和 Key 进入本机设置后分批接通。

## 安全约定

- 不要把 API Key 发到聊天、Issue、Commit、截图或日志中。
- API Key 将由本地设置页写入 macOS Keychain，不存入 `.env`、SQLite 或浏览器存储。
- 原始 `message.md` 含临时签名 URL，仅作为本地资料使用，已由 `.gitignore` 排除。
- 任何可能扣费的真实生成，都必须先在界面显示模型、参数和预计费用并由用户确认。

## 运行环境

- macOS（MVP）
- Node.js 24
- pnpm 11
- FFmpeg / ffprobe

本机已将 Homebrew 的 Node.js 24 作为项目专用运行时安装，未替换系统现有的全局 Node。打开终端后运行：

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
export MORPHFLOW_DATA_DIR="$HOME/Library/Application Support/MorphFlow"
pnpm install
pnpm dev
```

然后访问 <http://127.0.0.1:3000>。当前版本不需要 API Key。

## 验证

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
export MORPHFLOW_DATA_DIR="$HOME/Library/Application Support/MorphFlow"
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm audit:secrets
pnpm worker
```

`pnpm worker` 目前只执行安全启动自检并以 `degraded/not_configured` 退出，不会提交付费任务。
