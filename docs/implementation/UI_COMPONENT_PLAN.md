# MorphFlow 首个 UI 实现切片计划

> 状态：历史切片计划（已实施并由真实项目空间架构取代）<br>
> 日期：2026-08-09<br>
> 视觉方向：A · 电影剪辑工作台<br>
> 数据范围：以下 fixture 仅记录首个 UI 切片的历史设计；当前产品运行时已删除 demo 路由、示例素材和 fixture view<br>
> 依据：[PRD](../MorphFlow-PRD.md) · [技术设计](../TECHNICAL_DESIGN.md) · [工作台界面设计](../superpowers/specs/2026-08-09-morphflow-workbench-design.md)

> 当前实现以 `/projects` 真实文件夹大厅为顶层，项目页面只消费 SQLite 中的项目、镜头与素材；空项目显示真实空状态。本文后续出现的 `/projects/demo`、合成帧与 fixture 文件树均为已删除的历史方案，不再作为验收依据。

## 1. 切片目标

本切片用于验证两件事：A 方案的三栏电影剪辑工作台是否成立，以及同一套 capability 定义能否驱动不同输入模式、动态参数、约束与费用状态。

交付后，打开应用应直接看到示例项目的生成工作台，同时看到 A/B 画面、Paiwo 模式与模型、参数、约束、未知费用、环境健康状态。切换 ITV 与 ITV2 时，输入槽位和字段必须真实改变，而不是只换标题。

### 1.1 包含

- 工作台顶栏、六区域创作轨道、中央 A→B 监看器、素材条、右侧检查器。
- 一个示例项目、两张无版权风险的本地抽象帧素材。
- 两个 Paiwo fixture capability：单图 ITV、首尾帧 ITV2。
- 模式/模型双向筛选的结构；当前只有一个模型，但不能把组件写死为单模型。
- 由 capability 定义生成的输入槽位、常用参数、高级参数和跨字段约束。
- `Worker 离线`、`SQLite fixture`、`FFmpeg 未探测`、`Key 未配置`四类独立状态。
- 精确金额、范围、未知三类费用 UI 合同；本切片的 Paiwo 费用为未知。
- 1100px 以下检查器抽屉、768px 以下受限浏览状态。
- 键盘焦点、语义状态、对话框焦点管理和 reduced motion。
- 组件、约束和主要交互的无网络自动测试。

### 1.2 不包含

- SQLite、Worker、FFmpeg、Keychain 的真实读写或探测。
- 上传、截帧、生成、轮询、下载和 provider adapter。
- 真实 API Route、Server Action、SSE 或 paid confirmation 持久化。
- GPT Image、VLM 导演、任务恢复和结果比较的完整页面。
- 真实供应商响应、真实素材、签名 URL、余额或 API Key 输入框。
- 移动端完整剪辑体验。

“检查并生成”在本切片只能打开无付费的配置复核对话框；最终按钮文案为“演示切片暂不提交”，且必须 disabled，避免把视觉演示误解成已接通后端。

## 2. 路由设计

### 2.1 首个切片路由

| 路由 | 类型 | 行为 |
|---|---|---|
| `/` | Server redirect | 重定向到 `/projects/demo/generate`，不显示登录页或落地页。 |
| `/projects/[projectId]` | Server redirect | 合法 fixture 项目重定向到其 `/generate`；未知 ID 进入 `not-found`。 |
| `/projects/[projectId]/generate` | Server Page | 唯一完整实现页面；加载 fixture project/capabilities/health 后渲染工作台。 |
| `/projects/[projectId]/media` | Server Page | 复用工作台壳，中央显示“素材模块将在下一切片接通”；示例素材仍可见。 |
| `/projects/[projectId]/image` | Server Page | 复用壳并说明 AI 生图为可选模块，本切片无请求。 |
| `/projects/[projectId]/director` | Server Page | 复用壳并说明默认可手写，VLM 为可选模块。 |
| `/projects/[projectId]/jobs` | Server Page | 复用壳，显示空任务状态和“本切片没有提交任何任务”。 |
| `/projects/[projectId]/overview` | Server Page | 示例项目摘要、A/B 关系和本地 fixture 标识。 |

左轨的中文标签仍为“项目、素材、画面、导演、生成、任务”，分别映射到 `overview/media/image/director/generate/jobs`。使用真实 `<Link>`，保留打开新标签、复制链接、浏览器前进/后退和当前项 `aria-current="page"` 能力。

### 2.2 URL 与临时 UI 状态

- 路由只表达项目与一级区域，不把每次参数编辑写入 URL。
- `capability` 可使用受控查询参数，例如 `?capability=paiwo-v5.6-itv2`，用于刷新和分享当前模式；非法值回退到 fixture 默认值，并显示非阻断说明。
- 检查器抽屉开关、折叠项、对话框、擦除对比位置属于易失 UI 状态，不写 URL。
- fixture 草稿不使用 `localStorage`、`sessionStorage` 或 IndexedDB；刷新恢复只恢复 URL 中的 capability，不伪装成数据库已实现。

## 3. 页面组合与组件边界

```text
ProjectWorkbenchPage (Server)
└── WorkbenchShell (Server)
    ├── WorkbenchTopbar (Server)
    │   ├── ProjectIdentity
    │   └── HealthSummary (Server data, presentational output)
    ├── CreativeRail (Server)
    └── WorkbenchViewport
        ├── GenerateWorkbench (Client island)
        │   ├── MediaStage
        │   │   ├── TransitionPath
        │   │   ├── FrameViewport
        │   │   └── CompareControl
        │   ├── AssetFilmstrip
        │   └── GenerationInspector
        │       ├── ModeModelPicker
        │       ├── InputSlotBinder
        │       ├── DynamicParameterForm
        │       │   ├── ParameterField
        │       │   └── AdvancedParameters
        │       ├── ConstraintSummary
        │       ├── CostSnapshotCard
        │       └── ReviewGenerationButton
        │           └── GenerationReviewDialog
        └── InspectorDrawer (Client, narrow viewport only)
```

### 3.1 布局组件

| 组件 | 责任 | 明确不负责 |
|---|---|---|
| `WorkbenchShell` | 72px 左轨、顶栏、中央区、360px 检查器网格与跳转焦点。 | capability 解析、参数状态。 |
| `WorkbenchTopbar` | 项目名、镜头名、fixture 标记和四项健康摘要。 | 运行真实健康检查。 |
| `CreativeRail` | 六区域导航、当前项、每项文本状态；窄屏保持可操作。 | 业务依赖计算。 |
| `WorkbenchViewport` | 为不同一级区域提供统一中央画布边界。 | 模型表单。 |
| `InspectorDrawer` | 1100px 以下承载同一个检查器实例；打开、关闭、焦点返回。 | 复制一套表单状态。 |

### 3.2 创作组件

| 组件 | 责任 | 输入/输出 |
|---|---|---|
| `MediaStage` | 选择单图、A/B 并排或擦除视图；展示空槽位。 | 输入 asset view models、stage mode；输出预览模式变化。 |
| `TransitionPath` | 将 capability 的必需槽位投影为 `A → B` 关系，展示 ready/missing。 | 纯展示，不持有 asset。 |
| `FrameViewport` | 渲染本地 SVG fixture、来源徽标、A/B 标签和替代文本。 | 不读取任意磁盘路径。 |
| `CompareControl` | 并排/擦除切换和可键盘操作的比较位置。 | 输出 compare mode/position。 |
| `AssetFilmstrip` | 显示 A、B、来源、角色和选中态。 | 输出被选 asset ID；不修改 asset。 |

### 3.3 生成检查器组件

| 组件 | 责任 | 关键规则 |
|---|---|---|
| `ModeModelPicker` | 模式与模型均可作为第一筛选项，最终解析唯一 capability ID。 | 切换 capability 后使用新默认参数，清除旧模式不可见值。 |
| `InputSlotBinder` | 按槽位定义展示 A 或 A+B 绑定和缺失状态。 | ITV 只显示首帧；ITV2 显示首帧、尾帧。 |
| `DynamicParameterForm` | 遍历字段定义，按 `common/advanced` 分组渲染。 | 不包含 Paiwo 专用条件分支；使用 field kind/enum/range。 |
| `ParameterField` | 统一 label、control、description、error、disabled reason。 | disabled 必须伴随可见原因并建立 `aria-describedby`。 |
| `ConstraintSummary` | 聚合错误与警告，并可把焦点送到对应字段。 | 字段旁仍保留就地错误，不能只在此汇总。 |
| `CostSnapshotCard` | 展示 exact/range/unknown、证据状态和“未产生费用”。 | 不猜 Paiwo 价格。 |
| `GenerationReviewDialog` | 汇总模型、模式、输入、时长、分辨率、音频、约束、费用。 | 不提交、不存 Key、不模拟成功任务。 |

## 4. Server / Client 边界

首个切片保持 Client island 尽可能小，但动态表单、对比拖杆和抽屉共享同一编辑状态，因此使用一个 `GenerateWorkbench` client root，而不是在多个 Client Component 之间建立隐藏全局 store。

| 模块 | 边界 | 原因 |
|---|---|---|
| `app/layout.tsx`、项目 layouts/pages、redirect/not-found | Server | 路由、metadata、无浏览器状态。 |
| fixture loader | Server-only | 模拟后续仓储接口；避免 Client 直接依赖未来 SQLite 模块。 |
| capability 完整注册表 | Server/shared pure data | 定义可在服务端权威校验复用；本切片只序列化 UI 所需 view。 |
| `toWorkbenchViewModel` | Server/shared pure function | 去除 adapter、endpoint、证据原文等客户端不需要字段。 |
| `WorkbenchShell`、顶栏、左轨 | Server | 基本为静态结构；当前路由由 page/layout 传入。 |
| `GenerateWorkbench` | Client | 承载 capability、字段值、输入绑定、比较视图和复核弹层状态。 |
| 动态字段、选择器、抽屉、dialog | Client descendants | 需要即时交互、媒体查询或焦点管理。 |
| CSS、设计 token | shared static | 不引入运行时主题 store；首版只提供深色主题。 |

### 4.1 禁止跨边界内容

- Client bundle 不得导入 `src/server/**`、Node API、数据库路径、Keychain 或 provider transport。
- Client view model 不出现 endpoint、Authorization、provider raw body、签名 URL、真实本地路径。
- fixture 图片使用固定应用相对资源 URL，不使用 `file://` 或任意绝对路径。
- UI 状态只保存稳定 asset/capability/field ID，不保存 File、secret 或 provider response。

## 5. 共享 UI 合同

建议先建立最小、可扩展的 TypeScript 合同；字段名表达产品含义，不泄漏 DMXAPI 请求体。

```ts
type WorkbenchViewModel = {
  project: ProjectSummaryView;
  shot: ShotSummaryView;
  assets: AssetView[];
  capabilities: CapabilityView[];
  health: HealthView;
  initialCapabilityId: string;
};

type CapabilityView = {
  id: string;
  modelId: string;
  modelLabel: string;
  modeId: "image-to-video" | "first-last-frame";
  modeLabel: string;
  verification: "documented" | "tested" | "disabled";
  inputSlots: InputSlotView[];
  fields: ParameterFieldView[];
  constraints: ConstraintView[];
  pricing: PricingView;
  definitionVersion: string;
};

type ParameterFieldView =
  | EnumFieldView
  | NumberFieldView
  | BooleanFieldView
  | TextFieldView;

type PricingView =
  | { kind: "exact"; amountCny: number; evidenceLabel: string }
  | { kind: "range"; minCny: number; maxCny: number; evidenceLabel: string }
  | { kind: "unknown"; reason: string; evidenceLabel: string };
```

`ConstraintView` 采用有限操作符，例如 `not`、`equals`、`in`、`allOf`，并包含 `fieldIds`、`severity`、`message`。禁止在 fixture 中放可执行字符串或 `eval` 规则。

## 6. Fixture 设计

### 6.1 示例项目

| 字段 | Fixture 值 |
|---|---|
| project ID | `demo` |
| 项目名 | `霓虹街角 / TRANSITION STUDY` |
| shot | `SHOT 07` |
| A | `asset-frame-a`，角色 `first-frame`，来源 `video-frame` |
| B | `asset-frame-b`，角色 `last-frame`，来源 `local-upload` |
| 提示词 | 一段短中文镜头运动意图，只作本地展示，不声明由 AI 生成 |
| health | Worker offline、SQLite fixture、FFmpeg unchecked、Key unconfigured |

素材图使用仓库内自制的抽象 SVG：相同人物/构图轮廓，一张自然街景、一张霓虹能量化终点，用来清晰表达转场，不依赖外部图片服务。

### 6.2 Paiwo ITV fixture

- ID：`paiwo-v5.6-itv`。
- 输入：一个必需 `firstFrame`，默认绑定 A。
- 参数：
  - `prompt`：文本，常用，非空。
  - `duration`：枚举 `5 | 8 | 10`，默认 5 秒。
  - `quality`：枚举 `360p | 540p | 720p | 1080p`，默认 540p。
  - `motionMode`：枚举 `normal | fast`，默认 normal。
  - `generateAudio`：布尔，默认 false，并标注真实行为待验证。
  - `negativePrompt`：文本，高级；仅 ITV 展示。
  - `seed`：整数，高级，空值代表随机；范围在文档未确认前只做整数校验，不虚构上下界。
- 约束：1080p + 10 秒为 error；fast + 8 秒为 error。
- 费用：unknown，原因“ITV 准确价格尚未完成真实验证”。

### 6.3 Paiwo ITV2 fixture

- ID：`paiwo-v5.6-itv2`。
- 输入：必需 `firstFrame` 与 `lastFrame`，默认分别绑定 A、B。
- 参数与 ITV 相同，但不包含 `negativePrompt`；明确显示“ITV2 文档未确认此字段，本模式不发送”。
- 约束与 ITV 相同。
- 费用：unknown，原因“ITV2 准确价格尚未确认”。
- 验证状态：documented / unverified，不显示“可用”或“已调通”。

### 6.4 Fixture 健康状态

四项状态必须采用不同标签与解释，不能全部伪装成错误：

- Worker：`offline`，说明“UI 演示未启动任务进程”。
- SQLite：`fixture`，说明“当前未连接本地数据库”。
- FFmpeg：`unchecked`，说明“此切片未执行本机探测”。
- DMXAPI Key：`unconfigured`，说明“没有读取或保存任何密钥”。

## 7. 交互状态与状态转换

`GenerateWorkbench` 使用局部 reducer；action 和 state 为带联合类型，避免多个布尔量产生不可能组合。

```ts
type WorkbenchState = {
  capabilityId: string;
  values: Record<string, ParameterValue>;
  bindings: Record<string, string | null>;
  validation: ValidationResult;
  compare: { mode: "split" | "wipe"; position: number };
  advancedOpen: boolean;
  inspector: "docked" | "closed" | "drawer-open";
  review: "closed" | "open";
};
```

### 7.1 Capability 切换

1. 用户先改模式或模型。
2. 解析与两者兼容的 capability；无匹配时不改变当前 capability，并就地解释。
3. 以新 capability 默认值创建全新参数集合。
4. 只按相同语义槽位保留合法 asset 绑定；ITV2 → ITV 时删除 `lastFrame` 绑定，不能把它留在隐藏状态。
5. 重新运行全部客户端约束。
6. 费用确认状态重置；本切片只展示“需复核”，无持久确认。

### 7.2 参数与约束

- 每次参数变化先立即更新控件，再同步计算纯函数校验，目标反馈小于 200ms。
- `quality=1080p` 且 `duration=10`：两个字段旁均建立关联说明，汇总显示 error，复核按钮 disabled。
- `motionMode=fast` 且 `duration=8`：同样阻止复核。
- 修正任一字段后错误自动消失，不依赖 toast。
- 未填写 prompt 或缺少必需输入时视为 error。
- 文档待验证、音频行为待验证属于 warning，不阻止打开复核。

### 7.3 复核对话框

- 无错误时点击“检查并生成”打开 dialog。
- 对话框列出模型/模式、A/B、时长、分辨率、运动、音频和费用未知状态。
- 主提交按钮 disabled，文案“演示切片暂不提交”；旁边明确“未调用模型、未产生费用”。
- 关闭后焦点返回触发按钮；Escape 可关闭。

### 7.4 状态文案准则

- 不使用“已连接、已保存、可用、生成成功”等会暗示真实后端存在的词。
- `documented` 显示“文档支持 · 未实测”。
- `unknown` 费用显示“费用待确认”，不是 `¥0`。
- 所有 disabled 主操作附近都说明原因。

## 8. 响应式行为

### 8.1 `>= 1440px`

- 布局为 `72px / minmax(640px, 1fr) / 360px`。
- 右侧检查器 docked，内部独立滚动；底部操作区 sticky，但给表单保留等高 padding。
- 中央画面优先保持 16:9，宽度不足时以高度约束。

### 8.2 `1100–1439px`

- 左轨仍为 72px；检查器缩到 328px。
- 顶栏隐藏低优先级解释文案，但保留四项状态图标与可访问名称。
- 素材卡元数据减为来源和角色，不能隐藏 A/B。
- 1280px 宽度不出现页面级水平滚动。

### 8.3 `768–1099px`

- 主画布占满左轨以外空间；检查器变右侧 modal drawer。
- 页面提供固定“参数与生成”按钮打开 drawer。
- drawer 使用同一 `GenerationInspector`，不创建第二份状态或 DOM。
- 打开时锁定背景滚动、把焦点送到标题；关闭后返回按钮。

### 8.4 `< 768px`

- 保留项目、A/B 缩略预览、健康状态和一级导航。
- 动态参数区域显示“请使用桌面宽度完成参数配置”；不渲染难以可靠操作的复杂表单。
- 不把桌面三栏强行横向滚动；不承诺截帧、擦除拖杆和生成配置。

建议用 CSS container/grid/media queries 决定布局；JavaScript 媒体查询只用于 drawer 的焦点行为，不作为唯一内容可见性来源。浏览器缩放到 200% 时仍应进入窄屏布局，而不是裁切内容。

## 9. 无障碍要求

### 9.1 结构与命名

- 页面有一个 `<main>`、一个可见 `<h1>`，各区域标题层级连续。
- 顶部提供“跳到主画布”“跳到参数检查器”两个 skip links。
- 左轨使用 `<nav aria-label="创作区域">`；当前链接用 `aria-current="page"`。
- A/B 图像 alt 描述画面和角色，不重复卡片旁全部元数据。
- Worker、费用、验证等状态同时提供文字与图形符号，不能只靠颜色。

### 9.2 控件

- 所有 label 与控件使用稳定 ID 关联；说明、错误、disabled reason 合并到 `aria-describedby`。
- 分段选择器使用原生 radio group 语义；枚举参数优先原生 select 或完整键盘语义组件。
- 高级参数使用原生 `<details>/<summary>` 或等价可访问 disclosure。
- 擦除对比控件提供 `role="slider"`、`aria-valuemin/max/now`，同时提供等价数字输入或固定 25/50/75% 按钮。
- dialog 具备名称、描述、焦点圈定、Escape 关闭和焦点恢复。

### 9.3 键盘与视觉

- Tab 顺序：跳转链接 → 顶栏 → 左轨 → 素材/预览 → 模式 → 模型 → 输入槽位 → 常用参数 → 高级参数 → 约束/费用 → 复核。
- 不设置正数 `tabIndex`；视觉排序与 DOM 顺序一致。
- focus-visible 使用 2px accent 外扩，任何容器不得裁掉。
- 主正文/背景达到 WCAG AA；accent 小字需验证对 `surface` 的对比度，不合格时只用于边框或改用深色文字。
- 最小点击目标 36×36px，主要操作和轨道项目标 44px 高。
- `prefers-reduced-motion: reduce` 时取消分区位移、A→B 扫描和 smooth scroll，只保留即时显隐。
- 状态更新区谨慎使用 `aria-live="polite"`；参数每次输入不整段播报，只播报错误首次出现/消失。

## 10. 样式与设计 token 落地

- 在全局 CSS 建立 `--mf-canvas`、`--mf-surface`、`--mf-surface-raised`、`--mf-line`、`--mf-text-primary`、`--mf-text-muted`、`--mf-accent`、`--mf-warning`、`--mf-danger`、`--mf-info`。
- token 值与 A 方案一致；组件不散落十六进制色值。
- 噪点/细网格用纯 CSS、低透明度且 `pointer-events:none`；reduced motion 不影响纹理。
- 字体通过 `next/font/local` 自托管；字体文件尚未获准加入仓库前，先使用明确的系统 fallback，不在运行时访问 Google Fonts。
- 参数、时间码、model ID 使用 mono 字体栈；中文标题使用 serif fallback。
- 不引入图表、成品 dashboard 模板或无业务意义的渐变光球。

## 11. 建议文件树

```text
app/
├── globals.css
├── layout.tsx
├── page.tsx
└── projects/
    └── [projectId]/
        ├── layout.tsx
        ├── page.tsx
        ├── not-found.tsx
        ├── overview/page.tsx
        ├── media/page.tsx
        ├── image/page.tsx
        ├── director/page.tsx
        ├── generate/page.tsx
        └── jobs/page.tsx
src/
├── components/
│   ├── ui/                     # Button, Badge, FieldMessage, Dialog primitives
│   └── workbench/
│       ├── workbench-shell.tsx
│       ├── workbench-topbar.tsx
│       ├── creative-rail.tsx
│       ├── health-summary.tsx
│       └── inspector-drawer.tsx
├── features/
│   └── generation/
│       ├── components/
│       │   ├── generate-workbench.tsx
│       │   ├── media-stage.tsx
│       │   ├── transition-path.tsx
│       │   ├── asset-filmstrip.tsx
│       │   ├── generation-inspector.tsx
│       │   ├── mode-model-picker.tsx
│       │   ├── input-slot-binder.tsx
│       │   ├── dynamic-parameter-form.tsx
│       │   ├── parameter-field.tsx
│       │   ├── constraint-summary.tsx
│       │   ├── cost-snapshot-card.tsx
│       │   └── generation-review-dialog.tsx
│       ├── generation-reducer.ts
│       └── validation.ts
├── shared/
│   ├── model-registry/types.ts
│   └── view-models/workbench.ts
└── server/
    └── fixtures/
        ├── demo-project.ts
        ├── paiwo-capabilities.ts
        └── load-workbench-fixture.ts
public/
└── fixtures/
    ├── frame-a.svg
    └── frame-b.svg
tests/
├── unit/
│   ├── capability-validation.test.ts
│   ├── generation-reducer.test.ts
│   └── view-model-boundary.test.ts
├── components/
│   ├── dynamic-parameter-form.test.tsx
│   ├── mode-model-picker.test.tsx
│   └── generation-review-dialog.test.tsx
└── e2e/
    └── fixture-workbench.spec.ts
```

如果初始化后的项目采用 `src/app`，整体把 `app/` 移入 `src/app/`，不要同时保留两套路由根目录。

## 12. 可验收的实施顺序

以下任务按依赖顺序实施；每一步都有独立完成证据，避免先堆满视觉再补行为。

### Task 1：可运行骨架与 token

- 建立 Next.js App Router、TypeScript、全局 token、系统字体 fallback 和根重定向。
- 写一个首个失败的路由/页面 smoke test，再实现。
- 验收：`/` 到 `/projects/demo/generate`；页面标题、背景、主结构存在；无外网字体请求。

### Task 2：Fixture 合同与边界

- 建立 view model、两个 capability fixture、项目/素材/健康 fixture 和 server-only loader。
- 对 Client view 做敏感字段/未知字段边界测试。
- 验收：fixture 只含稳定 ID 和应用相对资源 URL；没有 endpoint、Key、绝对路径或 provider raw response。

### Task 3：工作台壳与六区域路由

- 实现顶栏、左轨、共享布局及六个路由。
- 验收：浏览器前进/后退正确；当前区语义正确；未知项目 404；1280px 无水平滚动。

### Task 4：A→B 中央舞台

- 实现两张自制 SVG、TransitionPath、stage、并排/擦除切换和 filmstrip。
- 验收：A/B 角色与来源同时可见；键盘可选择素材和控制擦除位置；无外部图片请求。

### Task 5：Capability 解析与双向选择

- 先写 ITV/ITV2 切换的 reducer/组件失败测试。
- 实现模式和模型的兼容解析、URL 初始值、非法 capability 回退。
- 验收：ITV 只有 A；ITV2 有 A+B；切回 ITV 后 B 槽位和不可见值确实被移除。

### Task 6：动态参数渲染

- 先为 enum/boolean/text/integer 和 common/advanced 写组件测试。
- 实现通用 `ParameterField` 与高级参数 disclosure。
- 验收：组件无 Paiwo ID 条件分支；ITV 展示 negative prompt，ITV2 不展示；所有字段 label/description 关联正确。

### Task 7：约束与费用

- 先写两个跨字段规则和三类费用的单元测试。
- 实现字段级错误、汇总跳转、unknown 费用卡和 verification badge。
- 验收：1080p+10s、fast+8s 均阻止复核并解释；修正后恢复；未知费用不显示 `¥0`。

### Task 8：无付费复核对话框

- 实现汇总 dialog 和永不提交的演示态。
- 验收：错误时无法打开；合法时摘要准确；主提交 disabled；明确没有调用模型和没有产生费用；焦点可恢复。

### Task 9：响应式与无障碍

- 实现 1440/1100/768 三个断点、单实例检查器抽屉、skip links、focus-visible 和 reduced motion。
- 验收：1280px 无水平滚动；1024px 使用 drawer；767px 显示桌面提示；200% 缩放不裁切主操作。

### Task 10：切片回归与交付

- 执行类型检查、lint、单元/组件/E2E、构建、凭据扫描和浏览器视觉检查。
- 在至少 1440×900、1280×800、1024×768、767×900 检查布局；验证 reduced motion 和纯键盘路径。
- 验收：没有真实网络/API/Key 操作；测试与构建均使用当次新鲜输出；交付报告列出准确命令、结果、未实现项和差异。

## 13. 测试清单

### 13.1 单元

- capability 默认值只包含定义内字段。
- ITV/ITV2 切换清除不兼容绑定与 hidden values。
- 两条跨字段约束的正反例。
- `exact/range/unknown` 三类费用格式化。
- 非法 URL capability 回退。
- view model 序列化后不含绝对路径、secret-like key、endpoint 和原始响应。

### 13.2 组件

- `ModeModelPicker` 先选模式和先选模型均解析同一 capability。
- 动态字段支持键盘，错误描述正确关联。
- 高级参数折叠时仍可通过 disclosure 到达。
- 复核摘要与当前值一致，dialog 焦点管理正确。
- disabled 控件与按钮均有可见原因。

### 13.3 E2E

1. 打开根路由进入 demo generate。
2. 确认顶栏、A/B、模型、模式、费用和健康状态同时可见。
3. 切 ITV，确认 B 槽位与 negative prompt 差异。
4. 切 ITV2，确认 A/B 与字段差异。
5. 构造 1080p+10s，确认字段错误与按钮禁用；修正后恢复。
6. 打开复核，确认“暂不提交”和零网络生成请求。
7. 1024px 打开/关闭检查器抽屉并检查焦点返回。
8. 全程仅键盘访问左轨、素材、选择器、参数、费用和复核。
9. reduced motion 下检查无非必要位移和扫描动画。

## 14. 切片完成定义

只有同时满足以下条件，首个 UI 切片才可标记完成：

- A 方案三栏工作台在 1280px 可完整使用且没有页面级水平滚动。
- 两个 capability 由同一注册表/字段渲染器驱动，输入与字段差异有测试证据。
- 约束、费用未知、未实测、Worker 离线、FFmpeg 未检查、Key 未配置均使用真实且不误导的文案。
- 客户端没有 server-only 导入、真实路径、secret、endpoint 或供应商原始结构。
- 所有主交互有键盘路径、焦点可见、状态不只靠颜色，窄屏 drawer 焦点正确。
- 自动测试、类型检查、lint 和 production build 以当次命令通过；浏览器尺寸与 reduced-motion 人工检查有记录。
- 没有真实网络请求、没有模型调用、没有产生费用、没有收集或保存 API Key。
