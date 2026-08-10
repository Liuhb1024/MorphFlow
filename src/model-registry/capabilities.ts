import type {
  BooleanFieldDefinition,
  ConstraintDefinition,
  EvidenceReference,
  FieldDefinition,
  InputRole,
  InputSlotDefinition,
  ModelModeDefinition,
  PricingDefinition,
} from "./types";

const REVIEW_DATE = "2026-08-09";
const MB = 1024 * 1024;

function evidence(
  status: EvidenceReference["status"],
  note: string,
): EvidenceReference {
  return {
    status,
    source: "local_provider_documentation",
    reviewedAt: REVIEW_DATE,
    note,
  };
}

const documented = (note: string): EvidenceReference =>
  evidence("documented", note);
const conflicting = (note: string): EvidenceReference =>
  evidence("conflicting", note);
const needsLiveTest = (note: string): EvidenceReference =>
  evidence("needs_live_test", note);
const unknown = (note: string): EvidenceReference => evidence("unknown", note);

function slot(
  id: string,
  role: InputRole,
  label: string,
  options: Pick<
    InputSlotDefinition,
    "accepts" | "required" | "minItems" | "maxItems"
  > &
    Pick<InputSlotDefinition, "limits">,
): InputSlotDefinition {
  return {
    id,
    role,
    label,
    description: label,
    ...options,
  };
}

const text = (
  id: string,
  label: string,
  required: boolean,
  maxLength?: number,
  group: "common" | "advanced" = "common",
): FieldDefinition => ({
  id,
  kind: "text",
  label,
  description: label,
  group,
  required,
  defaultValue: "",
  ...(required ? { minLength: 1 } : {}),
  ...(maxLength === undefined ? {} : { maxLength }),
  multiline: true,
});

const integer = (
  id: string,
  label: string,
  defaultValue: number | null,
  min?: number,
  max?: number,
  group: "common" | "advanced" = "common",
): FieldDefinition => ({
  id,
  kind: "integer",
  label,
  description: label,
  group,
  required: defaultValue !== null,
  defaultValue,
  ...(min === undefined ? {} : { min }),
  ...(max === undefined ? {} : { max }),
  step: 1,
});

const number = (
  id: string,
  label: string,
  defaultValue: number,
  min: number,
  max: number,
): FieldDefinition => ({
  id,
  kind: "number",
  label,
  description: label,
  group: "advanced",
  required: true,
  defaultValue,
  min,
  max,
});

const choice = (
  id: string,
  label: string,
  defaultValue: string | number,
  values: readonly (string | number)[],
  group: "common" | "advanced" = "common",
): FieldDefinition => ({
  id,
  kind: "enum",
  label,
  description: label,
  group,
  required: true,
  defaultValue,
  options: values.map((value) => ({ value, label: String(value) })),
});

const bool = (
  id: string,
  label: string,
  defaultValue: boolean,
  group: "common" | "advanced" = "advanced",
  extra: Partial<BooleanFieldDefinition> = {},
): FieldDefinition => ({
  id,
  kind: "boolean",
  label,
  description: label,
  group,
  required: true,
  defaultValue,
  ...extra,
});

const priceEvidence = (
  status: "documented" | "unknown" | "needs_live_test",
  label: string,
) => ({ status, label }) as const;

const unknownPrice = (
  reason: string,
  status: "unknown" | "needs_live_test" = "unknown",
): PricingDefinition => ({
  kind: "unknown",
  currency: "CNY",
  reason,
  evidence: priceEvidence(status, reason),
});

const firstFrame = (limits?: InputSlotDefinition["limits"]) =>
  slot("firstFrame", "first_frame", "首帧 A", {
    accepts: ["image"],
    required: true,
    minItems: 1,
    maxItems: 1,
    ...(limits === undefined ? {} : { limits }),
  });

const lastFrame = (limits?: InputSlotDefinition["limits"]) =>
  slot("lastFrame", "last_frame", "尾帧 B", {
    accepts: ["image"],
    required: true,
    minItems: 1,
    maxItems: 1,
    ...(limits === undefined ? {} : { limits }),
  });

const imageFormats = ["jpg", "jpeg", "png", "webp"] as const;

const gemini: ModelModeDefinition = {
  id: "gemini-3.6-flash:director",
  modelId: "gemini-3.6-flash",
  modelLabel: "Gemini 3.6 Flash",
  modeId: "director",
  modeLabel: "导演 / VLM",
  category: "vlm",
  description: "根据文字及可选图片、视频生成可编辑导演建议。",
  inputSlots: [
    slot("referenceImages", "reference_image", "参考图片", {
      accepts: ["image"],
      required: false,
      minItems: 0,
      maxItems: null,
      limits: { note: "当前资料未给出图片数量、格式或大小限制。" },
    }),
    slot("referenceVideos", "reference_video", "参考视频", {
      accepts: ["video"],
      required: false,
      minItems: 0,
      maxItems: null,
      limits: { note: "当前资料未给出视频数量、时长或大小限制。" },
    }),
  ],
  fields: [text("prompt", "导演任务与创作意图", true)],
  constraints: [],
  pricing: unknownPrice("Gemini 3.6 Flash 的价格尚无本地证据。"),
  evidence: [
    needsLiveTest("产品目标模型名为 gemini-3.6-flash，但本地示例仅覆盖 2.5。"),
    unknown("结构化输出参数和媒体限制未记录。"),
  ],
  maturity: "documented",
  registryVersion: 2,
};

const gptImage: ModelModeDefinition = {
  id: "gpt-image-2-03:reference-image-edit",
  modelId: "gpt-image-2-03",
  modelLabel: "GPT Image 2 (03)",
  modeId: "reference-image-edit",
  modeLabel: "参考图编辑",
  category: "image",
  description: "使用一张或多张参考图生成目标画面。",
  inputSlots: [
    slot("referenceImages", "reference_image", "参考图片", {
      accepts: ["image"],
      required: true,
      minItems: 1,
      maxItems: null,
      limits: { formats: imageFormats, note: "文档没有给出普通参考图数量上限。" },
    }),
    slot("mask", "mask", "局部编辑蒙版", {
      accepts: ["image"],
      required: false,
      minItems: 0,
      maxItems: 1,
      limits: {
        formats: imageFormats,
        maxBytes: 50 * MB,
        note: "需与第一张图片同尺寸、同格式并包含 alpha；尚待实测。",
      },
    }),
  ],
  fields: [
    text("prompt", "图片编辑提示词", true),
    choice("size", "输出尺寸", "auto", [
      "auto",
      "1024x1024",
      "1536x1024",
      "1024x1536",
      "2048x2048",
      "2048x1152",
      "3840x2160",
      "2160x3840",
    ]),
    choice("background", "背景模式", "auto", ["auto", "opaque"]),
    choice("quality", "渲染质量", "auto", ["low", "medium", "high", "auto"]),
    choice("outputFormat", "输出格式", "png", ["png", "jpeg", "webp"]),
    {
      ...integer("outputCompression", "输出压缩", 100, 0, 100, "advanced"),
      visibleWhen: {
        operator: "in",
        field: "outputFormat",
        values: ["jpeg", "webp"],
      },
    },
    choice("n", "生成数量", 1, [1], "advanced"),
  ],
  constraints: [],
  pricing: {
    kind: "exact",
    currency: "CNY",
    amount: 0.3,
    evidence: priceEvidence(
      "needs_live_test",
      "本地资料记录 gpt-image-2-03 为 ¥0.3/次，实际模型名与账单待验证。",
    ),
  },
  evidence: [
    conflicting("标题、推荐名、示例 payload 与产品 model name 不一致。"),
    needsLiveTest("gpt-image-2-03 的 n=1 和价格需要受控请求确认。"),
  ],
  maturity: "documented",
  registryVersion: 2,
};

const klingPrompt = (required: boolean) =>
  text("prompt", "视频提示词", required, 2500);
const klingCommonFields = (modes: readonly string[]): readonly FieldDefinition[] => [
  text("negativePrompt", "负面提示词", false, 2500, "advanced"),
  integer("duration", "时长（秒）", 5, 3, 15),
  choice("modelMode", "生成模式", "std", modes),
  bool("audio", "生成声音", false, "common"),
  number("cfgScale", "提示词相关性", 0.5, 0, 1),
  bool("watermark", "生成水印版本", false),
];
const klingRatio = choice("ratio", "画面比例", "16:9", ["16:9", "9:16", "1:1"]);

const klingPricing = (include4k: boolean): PricingDefinition => {
  const rows = [
    { when: [{ field: "modelMode", equals: "std" }, { field: "audio", equals: false }], ratePerSecond: 0.474 },
    { when: [{ field: "modelMode", equals: "std" }, { field: "audio", equals: true }], ratePerSecond: 0.711 },
    { when: [{ field: "modelMode", equals: "pro" }, { field: "audio", equals: false }], ratePerSecond: 0.632 },
    { when: [{ field: "modelMode", equals: "pro" }, { field: "audio", equals: true }], ratePerSecond: 0.948 },
    ...(include4k
      ? [
          { when: [{ field: "modelMode", equals: "4k" }, { field: "audio", equals: false }], ratePerSecond: 2.37 },
          { when: [{ field: "modelMode", equals: "4k" }, { field: "audio", equals: true }], ratePerSecond: 2.37 },
        ]
      : []),
  ];
  return {
    kind: "range",
    currency: "CNY",
    minimum: 3 * 0.474,
    maximum: 15 * (include4k ? 2.37 : 0.948),
    evidence: priceEvidence("needs_live_test", "按模式、声音与输出秒数计费，账单待验证。"),
    calculation: { kind: "per_second_table", selectors: ["modelMode", "audio"], rows },
  };
};

function klingCapability(
  definition: Pick<
    ModelModeDefinition,
    "id" | "modeId" | "modeLabel" | "description" | "inputSlots" | "fields" | "constraints" | "maturity"
  >,
  evidenceItems: readonly EvidenceReference[],
  include4k: boolean,
): ModelModeDefinition {
  return {
    modelId: "kling-v3",
    modelLabel: "Kling V3",
    category: "video",
    pricing: klingPricing(include4k),
    evidence: evidenceItems,
    registryVersion: 2,
    ...definition,
  };
}

const klingImageLimits = {
  formats: ["jpg", "jpeg", "png"],
  maxBytes: 10 * MB,
  minWidth: 300,
  minHeight: 300,
} as const;

const klingCapabilities: readonly ModelModeDefinition[] = [
  klingCapability(
    {
      id: "kling-v3:text-to-video",
      modeId: "text-to-video",
      modeLabel: "文生视频",
      description: "纯文本单镜头视频。",
      inputSlots: [],
      fields: [klingPrompt(true), ...klingCommonFields(["std", "pro", "4k"]), klingRatio],
      constraints: [],
      maturity: "documented",
    },
    [documented("单镜头文生参数在本地资料中完整记录。"), needsLiveTest("完整状态和结果有效期待验证。")],
    true,
  ),
  klingCapability(
    {
      id: "kling-v3:image-to-video",
      modeId: "image-to-video",
      modeLabel: "首帧生视频",
      description: "从单张首帧生成视频。",
      inputSlots: [firstFrame(klingImageLimits)],
      fields: [klingPrompt(false), ...klingCommonFields(["std", "pro"])],
      constraints: [],
      maturity: "documented",
    },
    [documented("首帧模式的核心参数有本地文档。"), conflicting("简介与 payload 对该模式是否支持 4K 描述不一致，因此不开放 4K。")],
    false,
  ),
  klingCapability(
    {
      id: "kling-v3:first-last-frame",
      modeId: "first-last-frame",
      modeLabel: "首尾帧生视频",
      description: "使用首帧和尾帧生成一镜到底视频。",
      inputSlots: [firstFrame(klingImageLimits), lastFrame(klingImageLimits)],
      fields: [klingPrompt(false), ...klingCommonFields(["std", "pro"])],
      constraints: [],
      maturity: "documented",
    },
    [documented("首尾帧字段有本地文档。"), conflicting("该模式 4K 支持描述冲突，因此不开放 4K。")],
    false,
  ),
  klingCapability(
    {
      id: "kling-v3:text-multi-shot",
      modeId: "text-multi-shot",
      modeLabel: "文生多镜头",
      description: "智能或自定义文本分镜。",
      inputSlots: [],
      fields: [
        klingPrompt(false),
        choice("shotType", "分镜方式", "intelligence", ["intelligence", "customize"]),
        {
          id: "shots",
          kind: "shot-list",
          label: "自定义分镜",
          description: "1–6 个分镜，单镜头提示词最多 512 字符，时长之和须等于总时长。",
          group: "common",
          required: false,
          defaultValue: [],
          minItems: 1,
          maxItems: 6,
          promptMaxLength: 512,
          sumDurationEqualsField: "duration",
          visibleWhen: { operator: "equals", field: "shotType", value: "customize" },
        },
        ...klingCommonFields(["std", "pro", "4k"]),
        klingRatio,
      ],
      constraints: [],
      maturity: "documented",
    },
    [documented("智能/自定义分镜、数量与时长求和规则有本地文档。")],
    true,
  ),
  klingCapability(
    {
      id: "kling-v3:image-multi-shot",
      modeId: "image-multi-shot",
      modeLabel: "图生多镜头",
      description: "用首帧生成智能或自定义多镜头视频。",
      inputSlots: [firstFrame(klingImageLimits)],
      fields: [
        klingPrompt(false),
        choice("shotType", "分镜方式", "intelligence", ["intelligence", "customize"]),
        {
          id: "shots",
          kind: "shot-list",
          label: "自定义分镜",
          description: "1–6 个分镜，单镜头提示词最多 512 字符，时长之和须等于总时长。",
          group: "common",
          required: false,
          defaultValue: [],
          minItems: 1,
          maxItems: 6,
          promptMaxLength: 512,
          sumDurationEqualsField: "duration",
          visibleWhen: { operator: "equals", field: "shotType", value: "customize" },
        },
        ...klingCommonFields(["std", "pro", "4k"]),
      ],
      constraints: [],
      maturity: "documented",
    },
    [documented("图生多镜头的分镜数量与时长规则有本地文档。"), needsLiveTest("图生多镜头的 4K 行为仍需确认。")],
    true,
  ),
  klingCapability(
    {
      id: "kling-v3:subject-control",
      modeId: "subject-control",
      modeLabel: "主体控制",
      description: "引用最多三个预先创建的主体生成一致性视频。",
      inputSlots: [
        firstFrame(klingImageLimits),
        slot("subjects", "subject_image", "主体引用", {
          accepts: ["image"],
          required: false,
          minItems: 0,
          maxItems: 3,
          limits: { note: "实际提交使用预先创建的 element ID；创建来源尚未补齐。" },
        }),
      ],
      fields: [klingPrompt(true), ...klingCommonFields(["std", "pro", "4k"])],
      constraints: [],
      maturity: "disabled",
    },
    [conflicting("主体示例缺失 image_tail 与 voice_list 的完整合同，element ID 创建来源也不完整。")],
    true,
  ),
];

const viduImageLimits = {
  formats: imageFormats,
  maxBytes: 50 * MB,
  aspectRatioRange: [0.25, 4] as const,
  note: "使用 Base64 时整个请求体不得超过 20 MB。",
};
const viduFields = (audioDefault: boolean, audioStatus: "documented" | "conflicting"): readonly FieldDefinition[] => [
  text("prompt", "视频提示词", false, 5000),
  bool("recommendedPrompt", "使用推荐提示词", false, "common"),
  integer("duration", "时长（秒）", 5, 1, 16),
  choice("resolution", "分辨率", "720p", ["540p", "720p", "1080p"]),
  bool("audio", "生成声音", audioDefault, "common", {
    availability: audioStatus,
  }),
  integer("seed", "随机种子", 0, undefined, undefined, "advanced"),
  bool("watermark", "添加水印", false),
  choice("watermarkPosition", "水印位置", 3, [1, 2, 3, 4], "advanced"),
  {
    ...text("watermarkImageUrl", "自定义水印图片 URL", false, undefined, "advanced"),
    enabled: false,
    disabledReason: "任意外部 URL 需要先经过服务端 allowlist 与下载校验。",
  },
  {
    ...text("callbackUrl", "任务回调 URL", false, undefined, "advanced"),
    enabled: false,
    disabledReason: "本地单用户 MVP 使用轮询，不接收外部回调。",
  },
];
const viduPricing: PricingDefinition = {
  kind: "range",
  currency: "CNY",
  minimum: 0.246875,
  maximum: 16 * 0.740625,
  evidence: priceEvidence("needs_live_test", "按分辨率与输出秒数计费，账单待验证。"),
  calculation: {
    kind: "per_second_table",
    selectors: ["resolution"],
    rows: [
      { when: [{ field: "resolution", equals: "540p" }], ratePerSecond: 0.246875 },
      { when: [{ field: "resolution", equals: "720p" }], ratePerSecond: 0.6171875 },
      { when: [{ field: "resolution", equals: "1080p" }], ratePerSecond: 0.740625 },
    ],
  },
};
const viduCapabilities: readonly ModelModeDefinition[] = [
  {
    id: "viduq3-pro:image-to-video",
    modelId: "viduq3-pro",
    modelLabel: "Vidu Q3 Pro",
    modeId: "image-to-video",
    modeLabel: "图生视频",
    category: "video",
    description: "从严格一张首帧图片生成视频。",
    inputSlots: [firstFrame(viduImageLimits)],
    fields: viduFields(true, "conflicting"),
    constraints: [],
    pricing: viduPricing,
    evidence: [conflicting("单图 audio 默认值自相矛盾；查询 model name 也存在冲突。")],
    maturity: "documented",
    registryVersion: 2,
  },
  {
    id: "viduq3-pro:first-last-frame",
    modelId: "viduq3-pro",
    modelLabel: "Vidu Q3 Pro",
    modeId: "first-last-frame",
    modeLabel: "首尾帧生视频",
    category: "video",
    description: "按顺序使用首帧和尾帧生成视频。",
    inputSlots: [
      firstFrame({ ...viduImageLimits, note: "两张图片分辨率比需要在 0.8–1.25。" }),
      lastFrame({ ...viduImageLimits, note: "两张图片分辨率比需要在 0.8–1.25。" }),
    ],
    fields: viduFields(true, "documented"),
    constraints: [],
    pricing: viduPricing,
    evidence: [documented("首尾帧请求参数有本地文档。"), conflicting("查询使用 vidu-get 还是 viduq2-pro-get 尚未解决。")],
    maturity: "documented",
    registryVersion: 2,
  },
];

const h3ImageLimits = {
  formats: ["jpg", "jpeg", "png", "webp", "heic", "heif"],
  maxBytes: 30 * MB,
  minWidth: 256,
  minHeight: 256,
  maxDimension: 5760,
  aspectRatioRange: [0.4, 2.5] as const,
};
const h3Fields = (multimodal: boolean): readonly FieldDefinition[] => [
  text("prompt", "视频提示词", true, 7000),
  choice("resolution", "分辨率", "768P", ["768P", "2K"]),
  choice("duration", "时长（秒）", 5, [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
  choice(
    "ratio",
    "画面比例",
    "adaptive",
    multimodal ? ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] : ["adaptive"],
  ),
  bool("watermark", "添加 AIGC 水印", false),
];
const h3Price: PricingDefinition = {
  kind: "range",
  currency: "CNY",
  minimum: 4 * 0.5,
  maximum: 15 * 0.8 + 15 * 0.8 + 4 * 0.2,
  evidence: priceEvidence("needs_live_test", "输出、输入视频和第六张起图片为复合计费，账单待验证。"),
  calculation: {
    kind: "compound",
    components: [
      { label: "输出视频", quantity: "output_seconds", ratesByResolution: { "768P": 0.5, "2K": 0.8 } },
      { label: "输入视频", quantity: "input_video_seconds", ratesByResolution: { "768P": 0.5, "2K": 0.8 } },
      { label: "超出免费数量的输入图片", quantity: "input_images_over_free_allowance", ratesByResolution: { "768P": 0.2, "2K": 0.2 }, freeAllowance: 5 },
    ],
  },
};
const h3Base = (
  id: string,
  modeId: ModelModeDefinition["modeId"],
  modeLabel: string,
  inputSlots: readonly InputSlotDefinition[],
): ModelModeDefinition => ({
  id,
  modelId: "MiniMax-H3",
  modelLabel: "MiniMax H3",
  modeId,
  modeLabel,
  category: "video",
  description: modeLabel,
  inputSlots,
  fields: h3Fields(false),
  constraints: [],
  pricing: h3Price,
  evidence: [documented("图生视频角色、参数和媒体限制有本地文档。"), needsLiveTest("MIME 映射和 usage 计费字段待验证。")],
  maturity: "documented",
  registryVersion: 2,
});
const h3Capabilities: readonly ModelModeDefinition[] = [
  h3Base("MiniMax-H3:image-to-video", "image-to-video", "首帧生视频", [firstFrame(h3ImageLimits)]),
  h3Base("MiniMax-H3:last-frame-to-video", "last-frame-to-video", "尾帧生视频", [lastFrame(h3ImageLimits)]),
  h3Base("MiniMax-H3:first-last-frame", "first-last-frame", "首尾帧生视频", [firstFrame(h3ImageLimits), lastFrame(h3ImageLimits)]),
  {
    id: "MiniMax-H3:multimodal-reference",
    modelId: "MiniMax-H3",
    modelLabel: "MiniMax H3",
    modeId: "multimodal-reference",
    modeLabel: "多模态参考生视频",
    category: "video",
    description: "综合参考图片、视频和音频生成视频。",
    inputSlots: [
      slot("referenceImages", "reference_image", "参考图片", {
        accepts: ["image"], required: false, minItems: 0, maxItems: 9, limits: h3ImageLimits,
      }),
      slot("referenceVideos", "reference_video", "参考视频", {
        accepts: ["video"], required: false, minItems: 0, maxItems: 3,
        limits: { maxBytes: 50 * MB, minDurationSeconds: 2, maxDurationSeconds: 15, maxTotalDurationSeconds: 15, note: "支持的帧率为 23.976–60。" },
      }),
      slot("referenceAudios", "reference_audio", "参考音频", {
        accepts: ["audio"], required: false, minItems: 0, maxItems: 3,
        limits: { formats: ["wav", "mp3"], maxBytes: 15 * MB, note: "音频不能作为唯一媒体输入。" },
      }),
    ],
    inputConstraints: [
      {
        kind: "minimum_total",
        slotIds: ["referenceImages", "referenceVideos", "referenceAudios"],
        minimum: 1,
        primarySlot: "referenceImages",
        message: "多模态参考模式至少需要一个媒体素材。",
      },
      {
        kind: "requires_any_if_present",
        ifSlot: "referenceAudios",
        requiredSlotIds: ["referenceImages", "referenceVideos"],
        primarySlot: "referenceAudios",
        message: "参考音频不能作为唯一媒体输入。",
      },
    ],
    fields: h3Fields(true),
    constraints: [],
    pricing: h3Price,
    evidence: [documented("多模态数量、单文件与总时长限制有本地文档。"), needsLiveTest("MIME 与 usage 计费字段待验证。")],
    maturity: "documented",
    registryVersion: 2,
  },
];

const happyFields = (includeRatio: boolean): readonly FieldDefinition[] => [
  text("prompt", "视频提示词", includeRatio, includeRatio ? 5000 : undefined),
  choice("resolution", "分辨率", "1080P", ["720P", "1080P"]),
  ...(includeRatio
    ? [choice("ratio", "画面比例", "16:9", ["16:9", "9:16", "3:4", "4:3", "4:5", "5:4", "1:1", "9:21", "21:9"])]
    : []),
  integer("duration", "时长（秒）", 5, 3, 15),
  bool("watermark", "添加 Happy Horse 水印", true),
  integer("seed", "随机种子", null, 0, 2147483647, "advanced"),
];
const happyPrice: PricingDefinition = {
  kind: "range",
  currency: "CNY",
  minimum: 3 * 0.9,
  maximum: 15 * 1.2,
  evidence: priceEvidence("needs_live_test", "按分辨率和输出秒数计费，账单待验证。"),
  calculation: {
    kind: "per_second_table",
    selectors: ["resolution"],
    rows: [
      { when: [{ field: "resolution", equals: "720P" }], ratePerSecond: 0.9 },
      { when: [{ field: "resolution", equals: "1080P" }], ratePerSecond: 1.2 },
    ],
  },
};
const happyCapabilities: readonly ModelModeDefinition[] = [
  {
    id: "happyhorse-1.1-i2v:image-to-video",
    modelId: "happyhorse-1.1-i2v",
    modelLabel: "HappyHorse 1.1 I2V",
    modeId: "image-to-video",
    modeLabel: "图生视频",
    category: "video",
    description: "从严格一张首帧图片生成视频。",
    inputSlots: [firstFrame({ formats: imageFormats, maxBytes: 20 * MB, minWidth: 300, minHeight: 300, aspectRatioRange: [0.4, 2.5] })],
    fields: happyFields(false),
    constraints: [],
    pricing: happyPrice,
    evidence: [documented("I2V 输入与生成参数有本地文档。"), conflicting("产品描述提及音画能力，但请求没有音频字段。")],
    maturity: "documented",
    registryVersion: 2,
  },
  {
    id: "happyhorse-1.1-r2v:reference-to-video",
    modelId: "happyhorse-1.1-r2v",
    modelLabel: "HappyHorse 1.1 R2V",
    modeId: "reference-to-video",
    modeLabel: "参考图生视频",
    category: "video",
    description: "使用 1–9 张有序参考图生成视频。",
    inputSlots: [slot("referenceImages", "reference_image", "参考图片", {
      accepts: ["image"], required: true, minItems: 1, maxItems: 9,
      limits: { formats: imageFormats, maxBytes: 20 * MB, note: "短边至少 400 px；顺序对应提示词中的 [Image N]。" },
    })],
    fields: happyFields(true),
    constraints: [],
    pricing: happyPrice,
    evidence: [documented("R2V 图片数量、顺序引用、比例与生成参数有本地文档。"), unknown("音频能力没有参数或结果合同。")],
    maturity: "documented",
    registryVersion: 2,
  },
];

const paiwoFields: readonly FieldDefinition[] = [
  text("prompt", "画面与运动描述", true, 2048),
  choice("duration", "时长", 5, [5, 8, 10]),
  choice("resolution", "分辨率", "540p", ["360p", "540p", "720p", "1080p"]),
  choice("motionMode", "运动模式", "normal", ["normal", "fast"]),
  bool("audio", "生成声音", false, "common", { availability: "conflicting" }),
  integer("seed", "随机种子", null, 0, 2147483647, "advanced"),
];
const paiwoConstraints: readonly ConstraintDefinition[] = [
  {
    id: "paiwo-fast-duration-8",
    when: { operator: "allOf", expressions: [
      { operator: "equals", field: "motionMode", value: "fast" },
      { operator: "equals", field: "duration", value: 8 },
    ] },
    fieldIds: ["motionMode", "duration"], primaryField: "motionMode", severity: "error", code: "incompatible",
    message: "快速运动模式不支持 8 秒时长。",
  },
  {
    id: "paiwo-1080p-duration-10",
    when: { operator: "allOf", expressions: [
      { operator: "equals", field: "resolution", value: "1080p" },
      { operator: "equals", field: "duration", value: 10 },
    ] },
    fieldIds: ["resolution", "duration"], primaryField: "resolution", severity: "error", code: "incompatible",
    message: "1080p 不支持 10 秒时长。",
  },
];
const paiwoRows = [
  [5, false, "360p", 0.7245], [5, false, "540p", 0.7245], [5, false, "720p", 0.9315], [5, false, "1080p", 1.5525],
  [5, true, "360p", 1.656], [5, true, "540p", 1.656], [5, true, "720p", 1.863], [5, true, "1080p", 2.484],
  [8, false, "360p", 1.449], [8, false, "540p", 1.449], [8, false, "720p", 1.863], [8, false, "1080p", 3.105],
  [8, true, "360p", 2.3805], [8, true, "540p", 2.3805], [8, true, "720p", 2.7945], [8, true, "1080p", 4.0365],
  [10, false, "360p", 1.5939], [10, false, "540p", 1.5939], [10, false, "720p", 2.0493],
  [10, true, "360p", 2.5254], [10, true, "540p", 2.5254], [10, true, "720p", 2.9808],
] as const;
const paiwoItvPrice: PricingDefinition = {
  kind: "range", currency: "CNY", minimum: 0.7245, maximum: 4.0365,
  evidence: priceEvidence("needs_live_test", "本地价格表可用于估算，真实账单尚未核验。"),
  calculation: {
    kind: "lookup_table", selectors: ["duration", "audio", "resolution"],
    rows: paiwoRows.map(([duration, audio, resolution, amount]) => ({
      when: [
        { field: "duration", equals: duration },
        { field: "audio", equals: audio },
        { field: "resolution", equals: resolution },
      ],
      amount,
    })),
  },
};
const paiwoCapabilities: readonly ModelModeDefinition[] = [
  {
    id: "paiwo-v5.6-itv:image-to-video",
    modelId: "paiwo-v5.6-itv",
    modelLabel: "Paiwo v5.6 ITV",
    modeId: "image-to-video",
    modeLabel: "图生视频",
    category: "video",
    description: "从一张首帧图片生成视频。",
    inputSlots: [firstFrame({ formats: imageFormats, maxDimension: 10000, note: "资料未说明 10000 px 是宽、高还是任意边。" })],
    fields: [...paiwoFields, text("negativePrompt", "负面提示词", false, 2048, "advanced")],
    constraints: paiwoConstraints,
    pricing: paiwoItvPrice,
    evidence: [documented("ITV 字段、约束和价格表有本地资料。"), conflicting("音频开启示例却返回 has_audio=false；认证格式也冲突。")],
    maturity: "documented",
    registryVersion: 2,
  },
  {
    id: "paiwo-v5.6-itv2:first-last-frame",
    modelId: "paiwo-v5.6-itv2",
    modelLabel: "Paiwo v5.6 ITV2",
    modeId: "first-last-frame",
    modeLabel: "首尾帧生视频",
    category: "video",
    description: "使用首帧与尾帧生成连续转场视频。",
    inputSlots: [firstFrame({ formats: imageFormats, maxDimension: 10000 }), lastFrame({ formats: imageFormats, maxDimension: 10000 })],
    fields: paiwoFields,
    constraints: paiwoConstraints,
    pricing: unknownPrice("ITV2 没有独立可靠价格表，credits 也不是人民币换算合同。"),
    evidence: [documented("ITV2 的输入、核心字段与交叉约束有本地文档。"), conflicting("查询示例不是合法 JSON，音频行为冲突，负面提示词支持未知。")],
    maturity: "documented",
    registryVersion: 2,
  },
];

export const capabilities = [
  gemini,
  gptImage,
  ...klingCapabilities,
  ...viduCapabilities,
  ...h3Capabilities,
  ...happyCapabilities,
  ...paiwoCapabilities,
] as const satisfies readonly ModelModeDefinition[];
