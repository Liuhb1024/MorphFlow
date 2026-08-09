# DMXAPI MVP 模型能力矩阵

> 文档状态：本地资料审计稿
>
> 审计日期：2026-08-09
>
> 证据范围：`message.md`、`docs/MorphFlow-PRD.md`、`docs/TECHNICAL_DESIGN.md`，以及 2026-08-09 经用户批准的受控最小文本实测
>
> 未进行：价格后台核对、图片/视频输入实测、结构化输出实测、真实生图或生视频请求

## 1. 使用规则

本矩阵是模型注册表和 Provider 适配器的实施依据，不是“接口已连通”的证明。所有能力必须使用以下四种状态之一：

| 状态 | 含义 | 产品行为 |
|---|---|---|
| `documented` | 当前本地资料对字段、约束或响应有明确描述，且资料内部未发现冲突 | 可进入注册表，但 UI 标注“文档能力，未实测” |
| `conflicting` | 本地资料对同一事实给出两个或更多不兼容说法 | 默认不提交该字段或模式；先补证据或做受控实测 |
| `unknown` | 当前资料没有给出足够信息 | 不猜默认值、不伪造价格、不宣称支持 |
| `needs_live_test` | 文档给出了一种说法，但必须用小额、经用户批准的真实请求确认 | 可完成代码和 mock 测试；真实提交开关保持关闭 |

补充原则：

- `documented` 不等于 `tested`。
- 同一个模型的模式、字段和查询协议分别标注状态，不能用“模型已支持”覆盖局部未知项。
- 价格只有在“模型名、模式、分辨率、时长、声音”均可匹配时才能展示确定值，否则显示 `unknown`。
- 所有结果 URL 必须立即下载到本地；日志和脱敏请求快照不得保存完整签名 URL。
- 创建请求超时后进入 `unknown`，不得自动重提付费任务。

## 2. 总览

| 模型 | MVP 模式 | 当前可确定的核心能力 | 主要阻断项 | 注册表建议 |
|---|---|---|---|---|
| `gemini-3.6-flash` | VLM 导演 | `/v1/chat/completions` 的裸 Token 认证、模型名和最小文本计量已受控实测 | 返回文本为空；价格、JSON Schema、图片/视频输入和媒体限制仍未知 | 保留导演 UI；完整导演提交保持 `disabled`，直到结构化输出与媒体能力实测 |
| `gpt-image-2-03` | 多参考图编辑/目标帧 | multipart 图片编辑、尺寸/质量/格式、`n=1` | 文档标题、推荐名、payload 名与产品调用名不一致；固定价是否适用于实际调用名需确认 | 可先做表单、预览和 mock；真实提交关闭 |
| `kling-v3` | 文生、首帧、首尾帧、多镜头、主体控制 | 模式最全；3–15 秒；声音、负面提示、cfg、水印 | 部分模式对 4K 支持描述冲突；主体协议缺字段；状态全集与结果 TTL 未给出 | 先接首尾帧/首帧，后接多镜头，主体控制最后 |
| `viduq3-pro` | 单图、首尾帧；文生待补证据 | 1–16 秒、540p/720p/1080p、音频、水印 | 查询注释与 payload 的模型名冲突；SSE 结果是人类可读文本；单图音频默认值自相矛盾 | 首尾帧适配器可编码，查询解析须先实测 |
| `MiniMax-H3` | 首帧、尾帧、首尾帧、多模态参考 | 输入角色和限制最完整；768P/2K；4–15 秒；明确状态枚举 | 文生能力未在现有请求文档中出现；成本较高； MIME 示例存在非标准映射 | 多模态注册表可先做，真实接入排在核心转场后 |
| `happyhorse-1.1-i2v` | 首帧生视频 | 1 张首帧、720P/1080P、3–15 秒 | 产品描述提到音画能力但没有音频字段；失败状态全集和失败计费未知 | 简单适配器，排在 Kling/Vidu 后 |
| `happyhorse-1.1-r2v` | 1–9 张参考图生视频 | 9 种比例、图片序号引用、720P/1080P、3–15 秒 | 音频能力未知；结果/任务 ID 仅 24 小时；失败计费未知 | 用于验证“动态参考图列表”，排在核心首尾帧之后 |
| `paiwo-v5.6-itv` | 单图生视频 | 独立上传、5/8/10 秒、4 档分辨率、声音、运动模式 | 认证格式冲突；`generate_audio_switch=true` 的示例结果却 `has_audio=false`；状态全集未知 | 首个真实视频适配器候选 |
| `paiwo-v5.6-itv2` | 首尾帧生视频 | 两次图片上传后绑定首尾帧；与 ITV 共用查询 | 精确价格缺失；负面提示是否可提交未知；返回示例 JSON 损坏；音频冲突 | 首个双输入注册表候选；价格未知时禁止付费提交 |

Seedance 2.0 已按产品决定排除，不进入 MVP 注册表。

## 3. Provider 公共协议审计

| 项目 | 本地资料结论 | 状态 | 实现要求 |
|---|---|---|---|
| 视频提交端点 | Kling、Vidu、H3、HappyHorse、Paiwo 示例均指向 `POST /v1/responses` | `documented` | endpoint 只存在 Provider transport，不进入 React 组件 |
| GPT Image 2 端点 | `POST /v1/images/edits`，multipart 表单 | `documented` | 独立 image adapter；不能复用 JSON transport |
| Gemini 端点 | `/v1beta/models/{model}:generateContent`；流式为 `:streamGenerateContent?alt=sse` | `documented`（仅 2.5 示例） | 独立 Gemini-native transport |
| Gemini OpenAI 兼容端点 | `POST /v1/chat/completions`，模型 `gemini-3.6-flash` | 最小文本请求已受控实测 | 仅证明认证、路由、模型名和计量可用；不能外推原生协议、媒体或结构化输出能力 |
| `/v1/responses` 认证 | 不同示例分别使用裸 `Authorization: <key>` 和 `Authorization: Bearer <key>` | `conflicting` | 认证方式按 capability 配置；真实测试前不可统一假定 |
| GPT Image 认证 | `Authorization: Bearer <key>` | `documented` | 仅服务端读取 Key；请求体和日志不得带 Key |
| Gemini 认证 | 查询参数 `?key=<key>` | `documented`（仅示例）/ `needs_live_test` | URL 日志必须移除 query；不要让错误堆栈泄漏完整 URL |
| 异步创建结果 | 各模型分别返回 `taskId`、`task_id` 或 `video_id`，部分嵌套在字符串化 JSON 中 | `documented` | adapter 返回统一 `providerTaskId`，同时保存脱敏原始响应 |
| 查询结果 | Kling/HappyHorse 为字符串化 JSON；Vidu 为 SSE 文本；H3 为 JSON；Paiwo 为 `Resp` JSON | `documented` | 每个模型单独 query parser，不能按一个通用 JSON 路径硬取 |
| 完整 HTTP 错误合同 | 仅散见 401/404/500 和业务错误示例 | `unknown` | transport 保存 HTTP status、provider code、可安全展示的 message |
| 幂等键 | 未记录 | `unknown` | 付费创建请求禁止自动重试；超时进入 `unknown` |
| 限流头/RPM/TPM | 用户说明额度高，但资料无响应头合同 | `unknown` | Worker 仍需 provider 级并发限制和指数退避，仅查询可安全重试 |
| 失败是否扣费 | 除被排除的 Seedance 提示外，各模型未形成可靠合同 | `unknown` | UI 不显示“失败不扣费”；需真实账单证据后再补 |

## 4. Gemini VLM 导演

### 4.1 能力与请求

| 项目 | 当前结论 | 状态 |
|---|---|---|
| 产品调用名 | `gemini-3.6-flash` | 最小文本连通性已受控实测；完整导演能力仍为 `needs_live_test` |
| 本地接口示例模型 | `gemini-2.5-flash` | `documented` |
| 文本输入 | `contents[].parts[].text` | `documented`（2.5 示例） |
| 图片输入 | inline Base64；资料同时出现 `inlineData/mimeType` 与 `inline_data/mime_type` | `conflicting` |
| 视频输入 | `inlineData` + `video/mp4` Base64 示例 | `documented`（2.5 示例）/ `needs_live_test` |
| 流式输出 | `streamGenerateContent?alt=sse`，逐条 `data:` JSON | `documented`（2.5 示例） |
| 普通输出 | `candidates[].content.parts[].text`，含 `finishReason`、`usageMetadata` | `documented`（2.5 示例） |
| 结构化 JSON Schema | PRD 要求导演输出严格 JSON；本地接口样例未给 generation config/schema 参数 | `unknown` |
| 媒体尺寸/时长/token 限制 | 未给出 | `unknown` |
| 价格 | 未给出 | `unknown` |

### 4.2 MVP 门槛

- 先完成导演输出的本地 JSON Schema、版本化编辑和 mock response；这些不依赖真实模型。
- 真实调用前必须确认 `gemini-3.6-flash` 是否可用、其准确请求路径、结构化输出参数、图片/视频限制和计价。
- 若只确认文本和图片，不得在 UI 宣称“视频理解已验证”。
- 解析失败必须保留脱敏原始响应，并允许用户继续使用手写提示词。

### 4.3 受控实测记录（2026-08-09）

- 经用户明确批准，对 OpenAI 兼容的 `/v1/chat/completions` 做最小文本连通测试；不含图片、视频或真实项目数据。第一次客户端进程未留下可判定结果，无法排除请求已到达 Provider；确认本机凭据读取正常后人工重试一次并取得下述结果。
- 请求模型为 `gemini-3.6-flash`，提示为最短文本，`max_tokens=4`、`temperature=0`、非流式；没有自动重试或模型回退。
- 有结果的请求返回 HTTP 成功，响应模型名一致；计量为输入 4、输出 1、总计 5 token。没有自动重试、模型回退或后续质量追测。
- `message.content` 为空，因此本次只验证“凭据、路由、模型名、计量”连通，不将导演文本质量、JSON、图片理解或视频理解标记为已验证。
- API Key 仅从 macOS Keychain 读取；未写入仓库、数据库、URL、命令参数或测试快照。精确费用因资料未给出单价而仍标记为 `unknown`。

证据：`message.md:3-4`、`message.md:4607-4802`、`message.md:4812-4961`、`message.md:4962-5383`；PRD `DIR-001`–`DIR-009`。

## 5. GPT Image 2

### 5.1 能力矩阵

| 项目 | 当前结论 | 状态 |
|---|---|---|
| 产品调用名 | `gpt-image-2-03` | `documented`（产品输入）/ `needs_live_test` |
| 文档标题/推荐/示例名 | 标题为 `gpt-image-2`，推荐 `gpt-image-2-ssvip`，payload 使用 `gpt-image-2` | `conflicting` |
| 模式 | 一张或多张参考图片 + prompt 的图片编辑 | `documented` |
| 输入传输 | multipart；同名 `image` 字段重复提交多文件 | `documented` |
| 输入格式 | 示例处理 PNG/JPEG/WEBP | `documented` |
| `size` | `auto`、1024 方/横/竖、2K 方/横、4K 横/竖；另有像素和比例约束 | `documented` / `needs_live_test` |
| `background` | `auto`、`opaque` | `documented` |
| `quality` | `low`、`medium`、`high`、`auto` | `documented` |
| `output_format` | PNG、JPEG、WEBP | `documented` |
| `output_compression` | 0–100，仅 JPEG/WEBP 生效 | `documented` |
| `n` | `gpt-image-2-03` 只支持 1 | `documented`（说明文字）/ `needs_live_test` |
| mask | 说明中出现，要求与首图同尺寸/格式并含 alpha；payload 未演示 | `documented` / `needs_live_test` |
| 输出 | 同步 200；`data[]` 中可能为 `b64_json` 或 `url` | `documented` |
| 价格 | 顶部记录 `gpt-image-2-03` ¥0.3/次 | `documented`（用户资料）/ `needs_live_test` |

### 5.2 MVP 门槛

- 首版仅开放“多参考图编辑 + n=1”；mask 可进入高级设置但在实测前默认关闭。
- 参考图的“主图/角色图/风格图”是 MorphFlow 内部语义，只通过稳定图片顺序和提示词表达，不发送虚构的 role 字段。
- `gpt-image-2-03`、`gpt-image-2`、`gpt-image-2-ssvip` 必须作为三个不同 model name 处理，不能静默替换。
- 费用确认必须绑定实际提交的 model name；无法确认时展示 `unknown` 并阻止真实提交。

证据：`message.md:49-51`、`message.md:416-586`；PRD `IMG-001`–`IMG-010`。

## 6. Kling V3

### 6.1 模式

| 模式 | 输入 | 关键约束 | 状态 |
|---|---|---|---|
| 文生单镜头 | prompt | 最长 2500 字符；`multi_shot=false` | `documented` |
| 文生多镜头 | prompt 或自定义分镜 | 1–6 镜头；单镜头 prompt ≤512；分镜时长和等于总时长 | `documented` |
| 首帧生视频 | 1 张 `image` + prompt | JPG/JPEG/PNG，≤10 MB，尺寸 ≥300 px | `documented` |
| 首尾帧一镜到底 | `image` + `image_tail` + prompt | 两字段至少一个；资料允许只传尾帧，但产品是否暴露尾帧单图模式未决定 | `documented` / `unknown`（产品范围） |
| 主体控制 | image、最多 3 个 `element_list` 主体、prompt 引用 | 使用 `<<<element_N>>>`；与 `voice_list` 互斥 | `documented`（概念）/ `conflicting`（请求字段） |
| 图生多镜头 | 1 张 image + 自定义/智能分镜 | 1–6 镜头；自定义时长求和 | `documented` |

### 6.2 公共字段、查询和价格

| 项目 | 当前结论 | 状态 |
|---|---|---|
| `duration` | 字符串枚举 `3`–`15`，默认 `5` | `documented` |
| `mode` | `std`、`pro`、`4k`，默认 `std` | `documented`；首帧/首尾帧简介只说 std/pro 而 payload 又列 4K，故这两模式为 `conflicting` |
| `sound` | `on` / `off`，默认 `off` | `documented` |
| `negative_prompt` | 最长 2500 字符 | `documented` |
| `cfg_scale` | 0–1，默认 0.5 | `documented` |
| `aspect_ratio` | 文生模式支持 16:9、9:16、1:1；图生模式未列该字段 | `documented` |
| `watermark_info.enabled` | boolean | `documented` |
| 多镜头字段名 | 文生使用 `multi_prompt`；图生示例把对应内容放在 `input` 数组 | `documented`，必须按模式映射 |
| 主体字段完整性 | 文档引用 `image_tail`、`voice_list`，但主体示例没有定义它们 | `conflicting` |
| 创建结果 | Responses 外层内的字符串化 JSON 含 `taskId` | `documented` |
| 查询模型 | `kling-v3-get-all` | `documented` |
| 成功结果 | 字符串化 JSON：`data.task_status=succeed`，视频在 `task_result.videos[]` | `documented` |
| 完整状态枚举/失败响应/URL TTL | 未给出 | `unknown` |
| 价格 | std 有声 0.711/秒、无声 0.474/秒；pro 有声 0.948/秒、无声 0.632/秒；4K 有声/无声均 2.37/秒 | `documented`（用户资料）/ `needs_live_test` |

### 6.3 MVP 门槛

- 第一批只实现首帧与首尾帧注册表；4K 在这两个模式的冲突解决前隐藏或标为不可提交。
- 第二批实现文生和多镜头，并用 fixture 验证分镜数量、索引和时长求和。
- 主体控制依赖主体 ID 创建/选择与未完整描述的 voice 协议，放到 Kling 最后一批。
- 状态映射在实测前只可确认 `succeed`；其余原始状态进入统一 `unknown`，不能猜成 failed。

证据：`message.md:587-2291`；PRD 11.1。

## 7. Vidu Q3 Pro

### 7.1 能力与字段

| 项目 | 单图 | 首尾帧 | 状态 |
|---|---|---|---|
| model | `viduq3-pro` | `viduq3-pro` | `documented` |
| 图片字段 | `images`，严格 1 张 | `input`，严格 2 张且顺序为首/尾 | `documented`，字段名按模式不同 |
| 图片格式/大小 | PNG/JPEG/JPG/WEBP；单张 ≤50 MB；Base64 请求体 ≤20 MB | 同左；两图分辨率比 0.8–1.25 | `documented` |
| prompt 字段 | `input` string，≤5000 字符 | `prompt` string，≤5000 字符 | `documented`，字段名按模式不同 |
| duration | 1–16 秒，默认 5 | 同左 | `documented` |
| resolution | 540p/720p/1080p，默认 720p | 同左 | `documented` |
| audio | 注释同时说官方默认 false、Q3 Pro 默认 true | 默认 true | 单图 `conflicting`；首尾帧 `documented` / `needs_live_test` |
| 其他字段 | `is_rec`、`seed`、`watermark`、`wm_position`、`wm_url`、`callback_url` | 同左 | `documented` |
| 文生模式 | PRD 矩阵标支持，但当前 `message.md` 没有对应提交文档 | — | `unknown` |

### 7.2 查询与价格

| 项目 | 当前结论 | 状态 |
|---|---|---|
| 创建结果 | JSON 含 `task_id`、`state=created` 和归一化参数 | `documented` |
| 查询 payload | 实际代码使用 `model=vidu-get`；紧邻注释却要求 `viduq2-pro-get` | `conflicting` |
| 查询协议 | `stream=true`，SSE `delta` 最终拼成人类可读的中文结果文本 | `documented` / `needs_live_test` |
| 回调状态 | `processing`、`success`、`failed` | `documented`（回调说明），轮询映射仍需验证 |
| 结果 URL TTL | 示例签名信息暗示视频约 24 小时、封面约 1 小时，但不是稳定合同 | `needs_live_test`，不可硬编码为保证 |
| 价格 | 540p 0.246875/秒、720p 0.6171875/秒、1080p 0.740625/秒 | `documented`（用户资料）/ `needs_live_test` |

### 7.3 MVP 门槛

- 先实现首尾帧请求 schema，这是 MorphFlow 的核心转场模式。
- 查询模型必须通过一次最低成本任务确认；确认前不得选择 `viduq2-pro-get` 或 `vidu-get` 中任一个作为生产默认。
- 不以正则长期解析中文 `delta`；实测时保存脱敏 SSE 事件，优先寻找结构化完成事件。
- 单图 `audio` 默认值必须在 UI 明确显式传递，避免依赖冲突的供应商默认值。

证据：`message.md:2660-3733`；PRD 11.2。

## 8. MiniMax H3

### 8.1 能力与输入限制

| 模式/项目 | 当前结论 | 状态 |
|---|---|---|
| 首帧 | text + 1 张 `image_url`，role 可为 `first_frame` 或省略 | `documented` |
| 尾帧 | text + 1 张 `image_url(role=last_frame)` | `documented` |
| 首尾帧 | text + `first_frame` + `last_frame`，各最多 1 张 | `documented` |
| 多模态参考 | text + 最多 9 图、3 视频、3 音频 | `documented` |
| 模式互斥 | first/last frame 不可与 reference image/video/audio 混用 | `documented` |
| prompt | 每次至少 1 个非空 text；单个 text ≤7000 字符 | `documented` |
| 图片 | JPG/JPEG/PNG/WEBP/HEIC/HEIF；≤30 MB；边长 256–5760；比例 0.4–2.5 | `documented` |
| 视频参考 | 最多 3 个；单个 ≤50 MB；2–15 秒；总时长 ≤15 秒；帧率 23.976–60 | `documented` |
| 音频参考 | 最多 3 个；WAV/MP3；单个 ≤15 MB；不可单独输入 | `documented` |
| 请求体 | 总大小 ≤64 MB；大文件建议 URL 或 `mm_file://` | `documented`；`mm_file` 的上传/生命周期文档 `unknown` |
| resolution | `768P`、`2K`，必填 | `documented` |
| duration | 整数枚举 4–15，必填 | `documented` |
| ratio | 图生固定 adaptive；多模态可 adaptive、21:9、16:9、4:3、1:1、3:4、9:16 | `documented` |
| watermark | `aigc_watermark` boolean，默认 false | `documented` |
| 文生视频 | 模型介绍/PRD 有泛化能力描述，但现有请求文档要求媒体场景 | `unknown` |

### 8.2 查询与价格

| 项目 | 当前结论 | 状态 |
|---|---|---|
| 创建结果 | 顶层 `task_id`；资料强调只返回一次，必须持久化 | `documented` |
| 查询模型 | `MiniMax-H3-get`，input 为 task ID | `documented` |
| 状态 | queued、running、succeeded、failed、cancelled | `documented` |
| 结果 | `task.content.url` | `documented` |
| 用量 | 查询含 output/input seconds 等 usage 信息 | `documented` / `needs_live_test` |
| 价格 | 768P 输出 0.50/秒、输入视频 0.50/秒；2K 各 0.80/秒；5 张内输入图免费，超出 0.20/张；音频免费 | `documented`（用户资料）/ `needs_live_test` |
| MIME | 示例要求按扩展名产生 `audio/mp3`、`video/mov` 等非标准 MIME | `conflicting`（与常规 MIME 习惯冲突）/ `needs_live_test` |

### 8.3 MVP 门槛

- 注册表必须将“图生”和“多模态参考”拆成两个互斥 capability。
- 费用估算需同时计算输出秒数、输入视频秒数和第 6 张起的图片数，不能只按输出时长。
- 首版只接 URL 和标准 data URI；`mm_file://` 在上传协议补齐前不开放。
- 本地 MIME 映射按 DMX 文档做 adapter 专属处理，并用真实小文件验证，不能污染全局媒体 MIME。

证据：`message.md:3734-4348`；PRD 11.3。

## 9. HappyHorse 1.1

### 9.1 I2V

| 项目 | 当前结论 | 状态 |
|---|---|---|
| 输入 | `input.prompt` 可选；`input.media` 有且仅有 1 个 `first_frame` | `documented` |
| 图片 | JPEG/JPG/PNG/WEBP；比例 1:2.5–2.5:1；宽高 ≥300；≤20 MB | `documented` |
| 参数 | resolution 720P/1080P（默认 1080P）；duration 3–15 整数（默认 5）；watermark 默认 true；seed 0–2147483647 | `documented` |
| 音频 | 模型描述提到音画同步，但请求参数无声音开关或音频输入 | `conflicting` / `unknown` |
| 价格 | 720P 0.9/秒、1080P 1.2/秒 | `documented`（用户资料）/ `needs_live_test` |

### 9.2 R2V

| 项目 | 当前结论 | 状态 |
|---|---|---|
| 输入 | 必填 prompt + 1–9 个 `reference_image` | `documented` |
| 图片引用 | prompt 通过 `[Image 1]`、`[Image 2]` 与数组顺序绑定 | `documented` |
| 图片 | JPEG/JPG/PNG/WEBP；短边 ≥400；≤20 MB | `documented` |
| ratio | 16:9、9:16、3:4、4:3、4:5、5:4、1:1、9:21、21:9；默认 16:9 | `documented` |
| 其余参数 | resolution、duration、watermark、seed 与 I2V 一致 | `documented` |
| 音频 | 无参数或结果合同 | `unknown` |
| 价格 | 720P 0.9/秒、1080P 1.2/秒 | `documented`（用户资料）/ `needs_live_test` |

### 9.3 公共查询与门槛

- 查询模型 `happyhorse-get`；创建和查询结果都嵌套在 Responses 的字符串化 JSON 中。
- 已记录 `PENDING`、`SUCCEEDED` 和过期后的 `UNKNOWN`；完整失败/取消状态为 `unknown`。
- task ID 和 video URL 均标注 24 小时有效，成功后必须立即下载。
- 文档建议约 15 秒轮询一次，任务通常 1–5 分钟；此值可作为初始 polling policy，但须支持退避和取消。
- I2V 可作为较简单的第二梯队 adapter；R2V 用来验证动态图片列表与顺序引用。

证据：`message.md:2292-2659`；PRD 11.4。

## 10. Paiwo V5.6

### 10.1 图片上传

| 项目 | 当前结论 | 状态 |
|---|---|---|
| 上传模型 | `paiwo-picture`，且生成模型只能使用该模型返回的 `img_id` | `documented` |
| 输入方式 | 纯 Base64 放 `input`；或 `input="url"` + `image_url` | `documented` |
| 格式 | PNG/WEBP/JPEG/JPG | `documented` |
| 尺寸 | 最大 10000 px；未说明是宽、高还是任意边，也未给文件大小 | `unknown`（边界语义） |
| 返回 | `Resp.img_id`、`Resp.img_url` | `documented` |
| 认证 | 上传示例使用 Bearer；生成/查询示例使用裸 token | `conflicting` |

### 10.2 ITV 与 ITV2

| 项目 | ITV | ITV2 | 状态 |
|---|---|---|---|
| 图像绑定 | `img_id` | `first_frame_img` + `last_frame_img` | `documented` |
| prompt | `input`，示例未明示限制 | `input` ≤2048 字符 | ITV `unknown`；ITV2 `documented` |
| duration | 5/8/10 秒 | 5/8/10 秒 | `documented` |
| quality | 360p/540p/720p/1080p | 同左 | `documented` |
| 交叉约束 | 1080p 不支持 10 秒 | 同左 | `documented` |
| motion_mode | normal/fast；fast 不支持 8 秒 | 同左 | `documented` |
| seed | 0–2147483647 | 同左 | `documented` |
| audio | `generate_audio_switch`，仅 v5.5/v5.6 | 同左 | 字段 `documented`；行为 `conflicting` |
| negative prompt | 有，≤2048 字符 | 提交示例无该字段，但查询示例含空值 | ITV `documented`；ITV2 `unknown` |
| 创建结果 | `Resp.video_id` + credits | 同左 | `documented` |
| 查询 | `paiwo-get`，input 为 video ID | 同左 | `documented` |
| 成功结果 | `Resp.url`，示例 status=5 | 同左，但示例 JSON 有重复键和重复 `Resp` | ITV `documented`；ITV2 `conflicting` |

### 10.3 价格与关键冲突

ITV 的本地价格表如下，可作为 `documented` 价格 fixture；任何真实展示仍标注待校验：

| 时长/声音 | 360p | 540p | 720p | 1080p |
|---|---:|---:|---:|---:|
| 5 秒无声 | 0.7245 | 0.7245 | 0.9315 | 1.5525 |
| 5 秒有声 | 1.656 | 1.656 | 1.863 | 2.484 |
| 8 秒无声 | 1.449 | 1.449 | 1.863 | 3.105 |
| 8 秒有声 | 2.3805 | 2.3805 | 2.7945 | 4.0365 |
| 10 秒无声 | 1.5939 | 1.5939 | 2.0493 | 不支持 |
| 10 秒有声 | 2.5254 | 2.5254 | 2.9808 | 不支持 |

- ITV2 没有独立价格表。返回 credits 不是人民币换算合同，因此 ITV2 费用为 `unknown`。
- ITV 和 ITV2 示例都在 `generate_audio_switch=true` 时返回 `has_audio=false`，属于明确的 `conflicting`；实测前默认关闭音频，并把结果中的真实 `has_audio` 当权威事实。
- 仅见 `status=5` 成功示例，完整状态码、失败原因和轮询间隔均为 `unknown`。
- ITV2 查询示例不是合法 JSON（重复 `Resp` 和重复键），adapter 不得基于该文本生成 fixture；应先保存真实脱敏响应。

### 10.4 MVP 门槛

- 图片上传、ITV、ITV2、查询拆成四个 adapter/capability，不在 UI 组件里拼字段。
- 在真实认证测试前，transport 支持 endpoint 级 `bare`/`bearer` 配置，但两者都不能无条件重试付费提交。
- ITV 可按已记录价格做费用确认；ITV2 因价格未知，默认禁止真实提交，直到补充价格证据或用户逐次接受“未知金额”策略。
- 最低成本连通顺序：上传 1 张测试图 → ITV 5 秒 360p/540p、无声、normal → 查询 → 立即下载；ITV2 在第二张图、价格与音频问题确认后再测。

证据：`message.md:41-48`、`message.md:4349-4606`、`message.md:5472-5639`；PRD 11.5。

## 11. 首批实现优先级

“实现”与“真实调用”分开排序：前者可以在无 Key、无费用条件下完成；后者必须在设置页本地保存 Key并逐次获得费用确认后进行。

### 11.1 代码实现顺序

| 波次 | 范围 | 选择理由 | 完成门槛 |
|---|---|---|---|
| 0 | 统一 capability 类型、动态字段、交叉约束、费用状态、mock Provider | 所有后续模型共享；不产生费用 | fixture 单测覆盖 documented/conflicting/unknown；禁用项不能提交 |
| 1 | `paiwo-picture` + Paiwo ITV/ITV2 + `paiwo-get` | 最小链路同时验证单图、双图、上传 ID、异步查询、价格和交叉约束 | mock 完整链路；ITV2 价格未知时真实提交被拦截 |
| 2 | Kling 首帧/首尾帧 + `kling-v3-get-all` | 核心转场能力，接口结构相对明确 | 3–15 秒、声音、模式、cfg、水印和首尾素材校验均有测试 |
| 3 | Vidu 单图/首尾帧 + query parser | 核心转场、1–16 秒且支持音频 | 查询 model 和结构化结果未实测时保持 disabled |
| 4 | Gemini 导演 + GPT Image 2 | 可选创作辅助；先做 schema、版本和 mock，不阻塞手工流程 | 无模型也能手写；原始/优化/最终提示词均不覆盖 |
| 5 | HappyHorse I2V/R2V | 验证 1–9 动态参考图及 24 小时结果处理 | 图片顺序稳定；成功即本地下载 |
| 6 | MiniMax H3 | 多媒体限制、成本公式和 MIME 最复杂 | 两种互斥 capability、媒体上限和复合费用均通过测试 |
| 7 | Kling 文生/多镜头/主体控制 | 非核心转场且主体/音色资料不完整 | 分镜求和、主体引用、voice 互斥均有明确证据和 fixture |

### 11.2 经批准的真实测试顺序

1. Gemini 最小文本请求：确认 `gemini-3.6-flash`、认证和响应；随后才测 JSON、图片、视频。
2. GPT Image 2 单图、`n=1`、低风险输入：确认准确 model name、返回格式与 ¥0.3 计价。
3. Paiwo 图片上传；不计生成费但仍不得把 Key 或图片 URL 写日志。
4. Paiwo ITV 5 秒、360p 或 540p、无声、normal：验证最低成本创建/查询/下载和 status。
5. Paiwo ITV2：只有精确价格或用户接受未知金额后才调用。
6. Kling 首尾帧最小允许时长、std、无声。
7. Vidu 首尾帧最小允许时长、540p、显式关闭 audio；重点采集 SSE 结构。
8. HappyHorse I2V，再测 R2V。
9. MiniMax H3 768P、4 秒、最少媒体；最后测试多模态成本。

## 12. 必须补齐的接口事实

以下项目没有答案前，相关 capability 不能从 `documented` 提升为 `tested`：

1. `gemini-3.6-flash` 的真实可用性、模型能力、结构化 JSON 参数、媒体限制和价格。
2. `gpt-image-2-03` 是否为准确提交名，以及它与 `gpt-image-2` / `gpt-image-2-ssvip` 的差异和实际计价。
3. `/v1/responses` 每个 endpoint/model 的认证到底是裸 token 还是 Bearer。
4. Kling 全部状态、失败结构、结果 TTL；首帧/首尾帧是否真实支持 4K。
5. Kling 主体模式缺失的 `image_tail` / `voice_list` 合同及主体 ID 的创建来源。
6. Vidu 查询究竟使用 `vidu-get` 还是注释中的 `viduq2-pro-get`，以及是否有机器可读的最终事件。
7. Vidu 单图 audio 默认值和各模式失败收费规则。
8. H3 adapter 所需的准确 MIME 值、`mm_file://` 上传协议和实际 usage 计费字段。
9. HappyHorse 音频能力、失败/取消状态全集及失败收费规则。
10. Paiwo ITV2 价格、完整 status 映射、negative_prompt 支持、音频真实行为和合法查询响应结构。
11. 各模型任务 ID/结果 URL 的真实有效期，以及下载失败后的恢复窗口。

## 13. 注册表落地约束

每个 `model + mode` 的 fixture 至少包含：

- `verification`: `documented | conflicting | unknown | needs_live_test | tested | disabled`。
- 输入槽位数量、角色、顺序、格式、尺寸、大小和互斥条件。
- 字段类型、默认值、枚举、范围、单位和条件显示规则。
- 跨字段约束及面向用户的禁用原因。
- 价格公式、币种、来源类型和“是否可确定”的计算结果。
- 提交 adapter、查询 adapter、任务 ID 路径、状态映射、结果路径。
- 证据引用、定义版本、最后一次真实测试时间和测试响应哈希。

其中 `conflicting` 和 `unknown` 字段不能静默发送；`needs_live_test` capability 默认不可真实提交。只有经过用户批准的受控调用获得脱敏证据后，才能将对应的局部事实提升为 `tested`。
