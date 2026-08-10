import type {
  ConstraintExpression,
  FieldDefinition,
  InputRole,
  ModelModeDefinition,
  PricingDefinition,
} from "@/model-registry/registry";

import type {
  CapabilityView,
  ConstraintView,
  ParameterFieldView,
  PricingView,
} from "./types";

const fieldLabels: Readonly<Record<string, string>> = {
  prompt: "镜头提示词",
  duration: "视频时长",
  resolution: "输出分辨率",
  motionMode: "运动节奏",
  audio: "生成声音",
  seed: "随机种子",
  negativePrompt: "负向提示词",
};

const constraintMessages: Readonly<Record<string, string>> = {
  "paiwo-1080p-duration-10":
    "1080p 与 10 秒暂不兼容，请降低时长或分辨率。",
  "paiwo-fast-duration-8":
    "快速运动与 8 秒暂不兼容，请调整运动节奏或时长。",
};

function labelFor(field: FieldDefinition): string {
  return fieldLabels[field.id] ?? field.label;
}

function toFieldView(
  field: FieldDefinition,
  defaultOverride: string | number | boolean | undefined,
): ParameterFieldView {
  const base = {
    id: field.id,
    label: labelFor(field),
    description: field.description,
    group: field.group,
    ...(field.enabled === false ? { disabled: true } : {}),
    ...(field.disabledReason ? { disabledReason: field.disabledReason } : {}),
  } as const;

  switch (field.kind) {
    case "text":
      return {
        ...base,
        kind: "text",
        defaultValue:
          typeof defaultOverride === "string"
            ? defaultOverride
            : field.defaultValue,
        required: field.required,
        multiline: field.multiline ?? false,
      };
    case "enum":
      return {
        ...base,
        kind: "enum",
        defaultValue:
          typeof defaultOverride === "string" ||
          typeof defaultOverride === "number"
            ? defaultOverride
            : field.defaultValue,
        options: [...field.options],
      };
    case "integer":
      return {
        ...base,
        kind: "number",
        defaultValue:
          typeof defaultOverride === "number"
            ? defaultOverride
            : (field.defaultValue ?? ""),
        integer: true,
        ...(field.min === undefined ? {} : { min: field.min }),
        ...(field.max === undefined ? {} : { max: field.max }),
        ...(field.step === undefined ? {} : { step: field.step }),
      };
    case "number":
      return {
        ...base,
        kind: "number",
        defaultValue:
          typeof defaultOverride === "number"
            ? defaultOverride
            : (field.defaultValue ?? ""),
        integer: false,
        ...(field.min === undefined ? {} : { min: field.min }),
        ...(field.max === undefined ? {} : { max: field.max }),
        ...(field.step === undefined ? {} : { step: field.step }),
      };
    case "shot-list":
      return {
        ...base,
        kind: "shot-list",
        defaultValue: field.defaultValue.map((shot) => ({ ...shot })),
        minItems: field.minItems,
        maxItems: field.maxItems,
        promptMaxLength: field.promptMaxLength,
      };
    case "boolean":
      return {
        ...base,
        kind: "boolean",
        defaultValue:
          typeof defaultOverride === "boolean"
            ? defaultOverride
            : field.defaultValue,
        ...(field.id === "audio"
          ? {
              warning:
                "文档请求字段与返回示例存在差异，真实行为待验证。",
            }
          : {}),
      };
  }
}

function collectEquals(
  expression: ConstraintExpression,
): ConstraintView["when"] {
  if (expression.operator === "equals") {
    if (
      expression.value === null ||
      (typeof expression.value !== "string" &&
        typeof expression.value !== "number" &&
        typeof expression.value !== "boolean")
    ) {
      throw new Error("UI constraints require scalar equality values");
    }
    return [{ fieldId: expression.field, equals: expression.value }];
  }

  if (expression.operator === "allOf") {
    return expression.expressions.flatMap(collectEquals);
  }

  throw new Error(`Unsupported UI constraint operator: ${expression.operator}`);
}

function toPricingView(pricing: PricingDefinition): PricingView {
  if (pricing.kind === "exact") {
    return {
      kind: "exact",
      amountCny: pricing.amount,
      evidenceLabel: pricing.evidence.label,
    };
  }
  if (pricing.kind === "range") {
    return {
      kind: "range",
      minCny: pricing.minimum,
      maxCny: pricing.maximum,
      evidenceLabel: pricing.evidence.label,
    };
  }
  return {
    kind: "unknown",
    reason: pricing.reason,
    evidenceLabel: pricing.evidence.label,
  };
}

export function toCapabilityViews(
  definitions: readonly ModelModeDefinition[],
  assetByRole: Partial<Record<InputRole, string>>,
  fieldDefaultOverrides: Readonly<
    Record<string, string | number | boolean>
  > = {},
): CapabilityView[] {
  return definitions.map((definition) => ({
    id: definition.id,
    modelId: definition.modelId,
    modelLabel: definition.modelLabel,
    modeId: definition.modeId,
    modeLabel: definition.modeLabel,
    verification: definition.maturity,
    definitionVersion: `registry-${definition.registryVersion}`,
    inputSlots: definition.inputSlots.filter((slot) => !slot.accepts.every((kind) => kind === "audio")).map((slot) => ({
      id: slot.id,
      label: slot.label,
      assetId: assetByRole[slot.role] ?? null,
      required: slot.required,
      accepts: [...slot.accepts],
      maxItems: slot.maxItems,
    })),
    fields: definition.fields.filter((field) => field.enabled !== false).map((field) =>
      toFieldView(field, fieldDefaultOverrides[field.id]),
    ),
    constraints: definition.constraints.map((constraint) => ({
      id: constraint.id,
      severity: constraint.severity,
      message: constraintMessages[constraint.id] ?? constraint.message,
      fieldIds: [...constraint.fieldIds],
      when: collectEquals(constraint.when),
    })),
    pricing: toPricingView(definition.pricing),
    ...(definition.id === "paiwo-v5.6-itv2:first-last-frame"
      ? {
          omittedFieldNote:
            "ITV2 文档未确认负向提示词，本模式不会发送该字段。",
        }
      : {}),
  }));
}
