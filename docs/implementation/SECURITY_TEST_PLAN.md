# MorphFlow MVP 安全与测试落地计划

> 状态：Implementation Gate Draft<br>
> 日期：2026-08-09<br>
> 依据：[MorphFlow PRD](../MorphFlow-PRD.md) 与 [技术设计](../TECHNICAL_DESIGN.md)<br>
> 适用范围：macOS、本地单用户、仅监听 localhost 的 Next.js + Node Worker MVP

## 1. 目的与边界

本文把 PRD 中的安全、数据完整性和可恢复性要求转换为可实施、可自动验证的工程门禁。测试默认使用临时目录、临时 SQLite、内存 Keychain fake 和本地 mock provider；不会读取真实 Key、访问 DMXAPI、使用真实私人素材或产生费用。

本计划特别保护四类资产：

- DMXAPI API Key、Cookie、CSRF token、签名下载 URL 等秘密。
- 用户原始视频、图片、提示词及其本地绝对路径。
- 已付费或可能已付费的供应商任务 ID、状态历史和结果文件。
- 原始素材、数据库迁移、哈希与只追加任务事件等可追溯证据。

MVP 不以“仅在本机运行”为理由省略 Web 防护。恶意网页仍可能向 localhost 发请求，供应商响应和上传文件也都属于不可信输入。

## 2. 强制完成门禁

以下门禁全部满足后，才可进入真实 API 连通测试：

| 门禁 | 必须证明的结果 |
|---|---|
| G0 可复现基线 | Node 24、锁文件、静态检查与测试命令已固定；无测试依赖真实网络或真实 Key。 |
| G1 凭据边界 | Key 只经服务端进入 Keychain adapter；浏览器存储、SQLite、日志、错误响应和 Git 中均不存在完整 Key。 |
| G2 localhost 边界 | 只监听回环地址；Host、Origin、CSRF、Cookie 和安全响应头均有正反用例。 |
| G3 文件边界 | 上传按流校验，资产只能通过 ID 访问，目录穿越、符号链接逃逸、伪造 MIME 和超限文件均被拒绝。 |
| G4 付费任务完整性 | 确认快照不可复用；提交结果不明进入 `unknown`；刷新、超时和 Worker 重启不会盲目重提。 |
| G5 Worker 可恢复性 | SQLite WAL、原子 lease、过期回收、非法状态跳转和下载恢复有集成测试。 |
| G6 本地处理安全 | FFmpeg/ffprobe 只用固定可执行文件和参数数组；用户输入不能变成 shell 或任意 FFmpeg 参数。 |
| G7 离线主流程 | mock provider 下的项目、上传、配置、确认、生成、轮询、下载和恢复 E2E 通过。 |
| G8 发布前审计 | lint、类型、单元、集成、E2E、构建和凭据扫描全部通过，且人工复核 `git diff` 与跟踪文件。 |

真实连通测试是单独的人工批准阶段，不属于自动测试通过条件。

## 3. 测试环境隔离合同

测试进程必须显式设置独立环境，任何字段缺失时直接失败，不得回退到用户真实目录：

```text
MORPHFLOW_ENV=test
MORPHFLOW_DATA_DIR=<runner-created-temporary-directory>
MORPHFLOW_PROVIDER_MODE=mock
MORPHFLOW_KEYCHAIN_ADAPTER=memory
MORPHFLOW_NETWORK_POLICY=loopback-only
```

约束：

- 测试数据目录由 runner 创建并在单个 suite 结束后清理；不得使用 `~/Library/Application Support/MorphFlow/`。
- 测试数据库、媒体、日志和结果全部位于该临时目录。
- mock server 绑定系统分配的回环端口，不固定公共端口。
- HTTP 客户端在测试模式只允许 `127.0.0.1` / `::1`；任何其他目标立即报错。
- Keychain adapter 通过依赖注入替换，测试不得执行 `/usr/bin/security`。
- fixture 只使用合成的小尺寸图片、短视频和 `morphflow_test_placeholder`，不复制 `message.md` 或用户素材。
- 时间、随机数、UUID、退避和 Worker 心跳通过可注入 clock/random 控制，避免慢测试和偶发失败。

## 4. API Key 与秘密管理

### 4.1 实现合同

- 浏览器通过同源 `POST` 把 Key 发送到本地服务；请求成功后表单立即清空。
- Keychain service 固定为 `cn.morphflow.local`，account 从服务端受控 provider ID 映射，不能由任意用户文本直通命令参数。
- 生产 adapter 使用 `execFile('/usr/bin/security', args)`；禁止 `shell: true`、字符串命令拼接和把 stdout/stderr 原样写日志。
- SQLite 只保存 provider、Keychain reference、`configured`、可选末四位和更新时间。
- 读取 Key 只允许 provider transport 的服务端/Worker 路径；API 永远不返回完整值。
- 删除和覆盖 Key 均为显式操作。连接测试必须说明是否会产生费用；MVP 默认只开放已确认无付费的连接测试。
- 应用环境变量不得承担持久化 Key；`.env.example` 只能包含空值或非秘密占位说明。

### 4.2 必测用例

| 层级 | 用例与断言 |
|---|---|
| 单元 | Keychain 参数是数组；provider ID 白名单生效；成功响应只有状态与脱敏指纹；adapter 异常经过脱敏。 |
| 集成 | 保存、覆盖、读取、删除均只作用于 fake；SQLite 全字段检索不到测试 Key；错误响应和结构化日志检索不到测试 Key。 |
| E2E | 设置 Key 后输入框不回显；刷新后仅显示“已配置/末四位”；Local Storage、Session Storage、IndexedDB、页面 HTML 和 URL 中均无完整值。 |
| 负向 | 含换行、引号、路径分隔符和命令字符的 provider/account 输入被拒绝，且不能改变实际执行文件或追加任意参数。 |

测试中的 secret 值应在运行时由多个片段拼接，避免把完整类 Key 字符串写入仓库。测试结束对临时目录和浏览器状态做全文检索。

## 5. localhost、CSRF 与浏览器边界

### 5.1 服务监听与请求验证

- 正式启动默认绑定 `127.0.0.1`；不得默认监听 `0.0.0.0`。如未来支持 IPv6，必须显式绑定 `::1` 并扩展同一验证集。
- Host 仅允许规范化后的 `localhost:<actual-port>` 和 `127.0.0.1:<actual-port>`；拒绝外部主机名、userinfo、重复 Host、转发 Host 和尾缀欺骗。
- 所有改变状态的请求只接受精确匹配的本地 Origin；缺失、`null`、外部 Origin 均拒绝。不要通过宽泛 CORS 解决失败。
- 服务端签发随机会话 Cookie，使用 `HttpOnly`、`SameSite=Strict`、`Path=/`；CSRF token 绑定该会话，客户端通过自定义 Header 回传，服务端恒定时间比较。
- `GET`/`HEAD` 不改变项目、Key、任务或确认状态；SSE 只读。敏感 mutation 不接受 query 参数和普通 HTML form 的降级路径。
- 生产响应设置 CSP、`frame-ancestors 'none'`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: no-referrer`；禁止把秘密插入页面脚本。

### 5.2 必测矩阵

- 正确 Host + Origin + Cookie + CSRF 成功。
- 单独缺少或篡改 Host、Origin、Cookie、CSRF 时返回 4xx 且无副作用。
- 外部网页 Origin、`Origin: null`、非回环 Host、代理转发头和 DNS-rebinding 风格 Host 被拒绝。
- CSRF token 跨会话复用、过期后复用、重复编码和大小写变体被拒绝。
- 只读请求不会创建草稿、确认或任务；错误响应不反射未经转义的 Origin/Host。
- 浏览器 E2E 检查 CSP、frame、nosniff、referrer policy 和 Cookie 属性。

## 6. 上传、媒体读取与路径安全

### 6.1 上传管线

1. 在应用 `temp/` 下创建随机临时文件，使用排他创建并禁止跟随符号链接。
2. 流式计算字节数和 SHA-256；在达到限制时立即终止，不把完整文件载入内存。
3. 文件名只用于经过长度限制和控制字符清理后的展示；磁盘名使用服务端生成的 UUID。
4. 同时校验允许的扩展名、声明 MIME、文件魔数和媒体解析结果；任何不一致默认拒绝。
5. 图片执行尺寸/像素总量限制；视频调用受超时约束的 ffprobe，并校验容器和流类型。
6. 数据库记录与文件写入采用补偿策略：校验成功后原子移动，事务失败则删除派生临时文件，永不覆盖原件。

具体大小、像素和时长上限由常量集中定义并进入测试 fixture；未确定前不在多个 handler 内写不同数字。

### 6.2 路径与资源访问

- API 只接受 project ID / asset ID，不接受绝对路径或相对路径参数。
- 数据库保存应用数据根目录内的规范相对路径；读取时解析并验证父目录边界。
- 禁止 `..`、绝对路径、NUL、路径分隔符混淆、Unicode 正规化碰撞、设备文件和符号链接逃逸。
- 读文件前验证目标是普通文件且位于预期 asset 目录；导出和删除同样使用受控 ID。
- 删除仍被 prompt、draft、job 或 result 引用的素材时拒绝；清理任务只处理自身登记的临时文件。

### 6.3 必测 fixture

- 合法 JPEG、PNG、WEBP、MP4/MOV 的最小合成样本。
- 扩展名与魔数不一致、双扩展名、零字节、截断文件、伪造 Content-Type。
- 超字节、超像素、异常尺寸、无视频流、多个异常流和 ffprobe 卡死。
- 文件名含 `..`、斜杠、反斜杠、NUL 等价输入、控制字符、超长 Unicode。
- 数据目录内部/外部符号链接、父目录逃逸、相同前缀目录边界（如 `media` 与 `media-evil`）。
- 上传中断、磁盘写失败、数据库提交失败后不产生可见半文件或孤立成功记录。

## 7. 外部响应、下载与 SSRF

- Provider base URL 与提交/查询 endpoint 只能来自受版本控制的 allowlist，不能从表单或模型响应提供。
- 结果下载只允许 HTTPS 和已批准的供应商/CDN host；解析 URL 后拒绝用户名密码、非标准协议、localhost、私网、链路本地和云元数据地址。
- 每次重定向都重新验证 scheme、host、端口和解析地址，限制重定向次数；最终响应限制 Content-Type、Content-Length、实际流式字节、总超时和空闲超时。
- 下载写随机临时文件并同步计算 SHA-256，媒体探测成功后原子移动；签名 URL 只用于即时下载，不作为长期可展示字段。
- 供应商成功但下载失败必须保留 provider task ID 与“生成成功，下载失败”的事实，允许只重试下载。

mock server 必须覆盖：正常下载、302 到允许 host、302 到回环/私网、超大 body、长度欺骗、错误 MIME、慢流、中断流、签名 URL 过期和成功响应缺 URL。

## 8. 日志、错误与响应快照脱敏

### 8.1 单一脱敏入口

- 所有日志经结构化 logger 和递归 redactor 后才能序列化；业务代码不得直接 `console.log` provider request/response。
- 字段名匹配 Authorization、Cookie、API key、token、secret、signature 等时整值替换。
- 文本再次扫描 Bearer 形式、常见 Key 前缀、Cookie、URL 查询签名和高熵疑似 token，防止秘密藏在异常 message 中。
- URL 只保留 scheme、host、path 与经允许的非敏感查询字段；默认删除 query 和 fragment。
- Provider 原始响应落库前使用同一 redactor，设置深度、字段数和字节上限；task ID/result ID 可保留，临时签名 URL 不保留完整 query。
- 默认不记录请求 body、完整提示词和本地绝对路径。必要诊断只记录长度、SHA-256、asset ID、correlation ID 和限长摘要。
- 日志轮转与保留期可配置；UI 导出诊断包前再次扫描，且不包含数据库和媒体原件。

### 8.2 必测用例

- 秘密分别出现在对象 key/value、嵌套数组、Error、header、URL、重定向 Location 和供应商异常 body 时均被移除。
- 大对象、循环引用、极深 JSON 和二进制内容不会让 logger 崩溃或绕过限制。
- 401、429、500、超时、解析错误和 FFmpeg stderr 的用户提示可操作，但不含 Key、Cookie、签名 query 或完整本地路径。
- 对日志文件、SQLite 快照、HTTP 响应和测试报告全文检索，均找不到运行时构造的 canary secret。

## 9. 费用确认与 `unknown` 提交状态

### 9.1 不可变确认合同

- 服务端根据 `draft_id + revision + registry_version + normalized_parameters + input_asset_hashes + cost_snapshot` 生成确认摘要。
- 用户确认写入只追加 `cost_confirmation`；任何参数、素材、模型定义或价格变化都会增加 revision 并使旧确认失效。
- 只有带当前有效确认的草稿能在同一 SQLite 事务内创建唯一 queued job；重复点击和重复请求返回同一个本地 job，不创建第二条。
- Worker 通过条件更新原子领取任务，先持久化 `submitting` 事件与本地 `submission_key`，再执行网络调用；网络请求不放在数据库事务中。
- 获得 provider task ID 后必须先持久化 ID，再进入 polling。页面刷新只读取本地 job，不触发再次 submit。

### 9.2 重试判定

| 场景 | 自动行为 |
|---|---|
| 服务端本地校验失败、尚未建立请求 | 标记 validation/local failure；不扣费，可由用户修改后新建 revision。 |
| 明确未发送任何请求字节的连接失败 | 仅当 transport 能证明未发送且策略允许时，可对同一 submission 做有限重试并记录事件。 |
| 已发送请求后超时、断连、坏 JSON，且没有可靠 provider task ID | 进入 `unknown`，停止自动 submit；不得用普通“重试”按钮重新生成。 |
| 已取得 provider task ID | 只轮询该 ID；查询可按策略退避重试。 |
| provider 明确拒绝且证明未创建任务 | 进入 failed，展示是否可能收费；用户修改/确认后创建新任务。 |
| provider succeeded、下载失败 | 保持生成成功事实，只重试下载，不重新生成。 |

`unknown` 的人工恢复入口只能：填写/匹配已有 provider task ID 后转 polling，或明确标记不可恢复；如用户要重新生成，必须显示“可能重复收费”并创建新的确认与 job。

### 9.3 必测故障注入

- 双击确认、并发两个确认请求、刷新重放、浏览器后退和 Worker 双实例竞争只产生一次 submit。
- mock 在“接收前断开”“接收 body 后断开”“创建 task 后丢失响应”“返回 task ID 后 Worker 崩溃”等精确时点注入故障。
- `unknown` 不被 lease 回收逻辑重新排队；重启 Web/Worker 后仍为 `unknown`。
- 状态机拒绝 `unknown -> submitting`、`succeeded -> submitting` 等非法自动跳转。
- 费用确认变化、registry version 变化和 asset hash 变化均使旧确认失效。

## 10. SQLite 与 Worker

### 10.1 数据库配置与迁移

- 每个生产连接开启 `foreign_keys=ON`、`journal_mode=WAL`、`busy_timeout=5000`；启动自检读取并验证实际值。
- migration 单调、版本化、可在空库和前一版本 fixture 上运行；不得以删除数据库作为升级策略。
- 外键、唯一索引和 CHECK 约束承担关键不变量：task ID/本地提交键唯一、引用不可悬空、当前状态属于允许枚举。
- `job_events` 只追加；测试禁止 UPDATE/DELETE 历史事件。`jobs.status` 只是当前查询索引。
- 数据库事务保持短小，不包含网络、FFmpeg、下载或长哈希操作。

### 10.2 lease 与恢复

- lease 领取是带状态与过期条件的原子更新；记录 worker ID、leased_at、lease_expires_at 和 attempt。
- Worker 只对明确可恢复的 polling/downloading/local-processing job 续租或回收；`submitting` 的恢复必须依据是否已持久化 provider task ID，否则进入 `unknown`。
- 一个 Worker 崩溃后，另一个只能在 lease 过期后接手；旧 Worker 恢复时因 lease owner/version 不匹配无法提交状态。
- MVP 同时最多一个付费 submit；轮询可限量并发，数据库繁忙时退避而不是无限自旋。

### 10.3 集成测试

- 空库 migration、逐版本 migration、重复启动幂等和失败 migration 保留原库。
- Web 写草稿与 Worker 更新任务并发时无 `database is locked` 泄漏到 UI，且不丢事件。
- 两 Worker 同时领取同一 job 只有一个成功。
- 在 submitting、polling、downloading 和原子移动前后终止 Worker，重启后的状态与副作用符合合同。
- 结果文件落盘但数据库提交失败、数据库成功但移动失败等场景能识别并补偿，不把半文件标成功。
- 应用重启后 queued/polling/downloading 恢复；failed/succeeded/unknown 不被误执行。

## 11. FFmpeg / ffprobe 执行安全

- 可执行文件路径来自应用配置/能力探测，正式执行限定为受信任的 `ffmpeg`/`ffprobe` 路径；不接受请求提供 executable。
- 只使用 `spawn`/`execFile` 与参数数组，`shell: false`，并加 `-nostdin`；不拼接命令字符串。
- 用户只能选择领域参数（时间戳、asset ID、输出格式），不能提供原始 flags、filter 表达式或协议 URL。
- 输入由 asset ID 解析到受控本地普通文件；输出是 temp 下随机路径，不能覆盖原件。
- 参数构造器验证有限数字、非负时间、视频时长边界、允许输出格式和分辨率上限。
- 捕获 stdout/stderr 时限制字节数并脱敏；设置启动、总运行和无输出超时，超时先终止子进程，必要时再强制终止。
- MVP 不接受 FFmpeg 网络输入。媒体探测和截帧不允许任意 protocol、concat 文件或用户提供的 filter script。

必测用例包括：带空格/引号/分号/命令替换样式的展示文件名、负数/NaN/Infinity/超长时间戳、越界时间、损坏视频、卡死进程、巨大 stderr、非零退出、部分输出和输出符号链接。断言参数数组保持边界、没有 shell 进程、失败不覆盖源文件。

## 12. Fixture 与 mock provider 设计

### 12.1 目录建议

```text
tests/
├── fixtures/
│   ├── media/                  # 小型合成媒体及生成说明
│   ├── registry/               # 各 capability 合法/非法参数
│   └── provider/               # 脱敏后的请求与响应 JSON
├── helpers/
│   ├── temporary-app.ts
│   ├── fake-keychain.ts
│   ├── fake-clock.ts
│   └── mock-provider.ts
├── unit/
├── integration/
└── e2e/
```

### 12.2 mock provider 合同

- 在回环随机端口实现上传、提交、查询和结果下载的最小协议族；记录收到的规范化请求，但先执行 redaction。
- scenario 通过测试进程内 API 配置，不由生产请求参数选择，避免把测试后门带入正式环境。
- 支持确定性状态序列：queued → running → succeeded，以及 failed、429、500、超时、坏 JSON、未知 status、重复 status、URL 过期。
- 支持网络故障点：连接前、读取部分 body 后、创建任务后响应前、下载部分内容后。
- 提供调用计数和 submission key 记录，让测试能断言“只提交一次”，而不只看最终 UI。
- fixture 保留供应商字段形态但去除真实 ID、URL query、Key 和私人提示词；每个 fixture 注明来源类型（synthetic/sanitized）与 schema 版本。

禁止在测试里用“成功响应”覆盖所有模型。每个 adapter 至少有成功、认证失败、限流、供应商失败、未知状态、解析错误和缺 task/result ID fixture。

## 13. 测试分层与覆盖清单

### 13.1 静态检查

- TypeScript strict、ESLint、格式检查和 Next.js build。
- server-only 边界检查：Keychain、DB、文件路径和 provider secret 模块不得进入 client bundle。
- 禁止生产代码的 `shell: true`、动态 `eval`、原始 provider URL 和未受控 `console.log`。
- migration、registry definition 和 fixture schema 校验。

### 13.2 单元测试

- 模型注册表默认值、枚举、范围、依赖/互斥、价格与版本快照。
- 动态参数归一化与服务端权威校验。
- Keychain 参数、Host/Origin/CSRF、路径 containment、MIME/魔数、URL allowlist。
- redactor、错误归类、状态机、重试分类、确认摘要和费用失效。
- lease 条件构造、退避、FFmpeg 参数构造和结果文件命名。

### 13.3 集成测试

- Route Handler + 临时 SQLite + 文件系统 + fake Keychain。
- migration/WAL、项目和素材事务、唯一约束、只追加 job events。
- Worker + mock provider 的 submit/poll/download/恢复与全部故障注入。
- 上传流限制、原子移动、哈希、ffprobe fake/process runner fake。
- canary secret 贯穿异常路径后的日志、DB、HTTP 响应扫描。

### 13.4 E2E

- 新建项目 → 上传 A/B → 跳过 AI 生图/VLM → 手写提示词 → 选模式/模型 → 动态参数 → 费用确认 → mock 生成 → 本地结果。
- 上传视频 → 时间轴定位 → 截取原分辨率 A；异常媒体给出可操作错误。
- GPT Image 和导演可选分支使用 mock；原始/优化/最终提示词版本不互相覆盖。
- 刷新/重启后项目、草稿、确认、任务与结果恢复。
- 参数或素材变化使旧费用确认失效；双击不重复提交。
- `unknown`、provider failed、生成成功但下载失败、结果 URL 过期均有清晰恢复入口。
- 设置页凭据不回显、不进浏览器存储；外部 Origin/错误 CSRF 请求失败。

### 13.5 手工探索与真实 API

自动门禁通过后才进入 PRD 第 21 节的小额连通顺序。每个付费步骤都需用户单独批准，并使用非敏感测试素材。真实测试记录只保存脱敏请求摘要、provider/task ID、状态序列、耗时、已知费用和结果哈希；API Key 与完整签名 URL 永不写入报告。

## 14. 分阶段落地顺序

### Phase 0：测试骨架与安全默认值

- 建立 unit/integration/e2e 目录、临时应用 helper、fake clock、fake Keychain 和 loopback-only mock。
- 固定 lint、typecheck、test、build、credential-scan 脚本。
- 首批失败测试覆盖 `.gitignore`、只监听回环、server-only import、日志 canary 和测试目录隔离。

退出条件：G0，且任何测试都不依赖真实网络、真实 Key 或用户数据。

### Phase 1：秘密、localhost 与文件边界

- 先写 Keychain adapter 合同、CSRF/Host/Origin middleware、上传/路径/URL validator 的失败测试。
- 实现最小安全路径，再补 mutation route、asset reader 和下载器集成测试。

退出条件：G1、G2、G3。

### Phase 2：数据库、确认与 Worker

- 先用状态机与并发测试固定 queued/submitting/unknown/polling/downloading 合同。
- 实现 migrations、WAL 自检、lease、job events、确认摘要与 mock provider。
- 用双 Worker 和进程终止故障注入证明不可重复收费边界。

退出条件：G4、G5。

### Phase 3：媒体处理与离线主流程

- 先测试参数构造和 process runner，再接本机 FFmpeg 能力探测。
- 打通上传、截帧、mock 生成、下载、元数据和结果版本 E2E。

退出条件：G6、G7。

### Phase 4：全模型 adapter 与发布前审计

- 每个 capability 增加参数/计价 fixture 和 adapter 成功/失败协议测试。
- 完成全量回归、构建、client bundle 检查、凭据扫描和人工差异审查。

退出条件：G8；之后才可请求真实连通测试批准。

## 15. 验收命令模板

以下是仓库脚本建立后的预期命令，不代表本文编写时已经运行。脚本名如实施时调整，必须同步更新本文和 README。

```bash
# 环境与可复现安装
node --version
corepack pnpm --version
corepack pnpm install --frozen-lockfile

# 静态质量
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm format:check

# 分层测试（默认必须离线且使用临时目录）
corepack pnpm test:unit
corepack pnpm test:integration
corepack pnpm test:e2e

# 生产构建及服务端/客户端边界检查
corepack pnpm build
corepack pnpm test:bundle-boundaries

# 安全门禁
corepack pnpm test:security
corepack pnpm credentials:scan

# 完整本地验收
corepack pnpm verify
```

`pnpm verify` 预期串联 lockfile 校验、lint、类型、格式、单元、集成、E2E、构建、bundle 边界和凭据扫描；不得通过跳过失败测试来获得绿色结果。

提交前还要执行只读人工审查：

```bash
git status --short
git diff --check
git diff --cached --check
git ls-files
git diff --cached
git log -p --all -- .env message.md
```

凭据扫描至少覆盖工作树已跟踪文件、暂存区和 Git 历史。推荐把成熟扫描器封装为 `pnpm credentials:scan`；在扫描器接入前，可用 `git grep` / `rg` 做补充检查，但它们不能替代历史扫描和人工 diff 审核。扫描命中应删除/轮换真实秘密并清理历史，禁止单纯放宽规则或加入忽略项。

## 16. 完成证据模板

每个 Phase 完成时记录：

```text
Phase:
Commit / working tree:
Changed files:
Commands actually run:
Exact pass/fail counts:
Credential scan result:
Network/API activity: none | explicitly approved details
Fixture/data used:
Known failures or skipped checks:
Residual risk and next approval:
```

没有当前工作区的新鲜命令输出，不得写“已通过”“已验证”或“可发布”。真实 API 未调用时明确写“未验证真实供应商行为”，不能用 mock 结果替代连通结论。

## 17. 需求追踪

| 本计划章节 | 主要对应需求 |
|---|---|
| 4 | SEC-001～SEC-009 |
| 5 | SEC-001、SEC-003、SEC-004；技术设计 10.2 |
| 6～7 | PRJ-003～PRJ-007、FRM-003～FRM-005、JOB-006～JOB-007 |
| 8 | SEC-004、JOB-001、错误处理与可追溯要求 |
| 9 | CST-001～CST-006、JOB-001～JOB-008 |
| 10 | JOB-001～JOB-009、非功能需求中的迁移与恢复 |
| 11 | FRM-002～FRM-004、技术设计媒体处理边界 |
| 12～15 | PRD 第 20～21 节验收标准和技术设计第 13～14 节 |
