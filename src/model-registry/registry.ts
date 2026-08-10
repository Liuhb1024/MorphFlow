import { capabilities } from "./capabilities";
import type {
  ConstraintDefinition,
  ConstraintExpression,
  FieldDefinition,
  InputBindingValue,
  ModelModeDefinition,
  ParameterValue,
  PricingCondition,
  ShotValue,
  ValidationIssue,
  ValidationResult,
} from "./types";

export type {
  BooleanFieldDefinition,
  CapabilityCategory,
  CapabilityMaturity,
  CapabilityModeId,
  ConstraintDefinition,
  ConstraintExpression,
  EnumFieldDefinition,
  EvidenceReference,
  EvidenceStatus,
  FieldDefinition,
  InputBindingValue,
  InputConstraintDefinition,
  InputRole,
  InputSlotDefinition,
  IntegerFieldDefinition,
  ModelModeDefinition,
  NumberFieldDefinition,
  ParameterValue,
  PricingCalculation,
  PricingCondition,
  PricingDefinition,
  PricingEvidence,
  ShotListFieldDefinition,
  ShotValue,
  TextFieldDefinition,
  ValidationIssue,
  ValidationIssueCode,
  ValidationResult,
} from "./types";

export type CapabilityId = (typeof capabilities)[number]["id"];

const capabilityById = new Map<string, ModelModeDefinition>(
  capabilities.map((capability) => [capability.id, capability]),
);

export function listCapabilities(): readonly ModelModeDefinition[] {
  return capabilities;
}

export function getCapability(id: string): ModelModeDefinition {
  const capability = capabilityById.get(id);

  if (!capability) {
    throw new Error(`Unknown capability: ${id}`);
  }

  return capability;
}

export function createCapabilityDefaults(
  capabilityId: string,
): Readonly<Record<string, ParameterValue>> {
  const capability = getCapability(capabilityId);

  return Object.fromEntries(
    capability.fields.map((field) => [field.id, field.defaultValue]),
  );
}

export function normalizeCapabilityDraft(
  capabilityId: string,
  draft: Readonly<Record<string, unknown>>,
): Readonly<Record<string, ParameterValue>> {
  const capability = getCapability(capabilityId);
  const normalized: Record<string, ParameterValue> = {};

  for (const field of capability.fields) {
    const rawValue = draft[field.id];

    if (rawValue === undefined) {
      normalized[field.id] = field.defaultValue;
      continue;
    }

    if (
      rawValue === "" &&
      (field.kind === "integer" || field.kind === "number") &&
      !field.required
    ) {
      normalized[field.id] = null;
      continue;
    }

    if (field.kind === "text" && typeof rawValue === "string") {
      normalized[field.id] = rawValue.trim();
      continue;
    }

    if (field.kind === "shot-list" && Array.isArray(rawValue)) {
      normalized[field.id] = rawValue.flatMap((entry): readonly ShotValue[] => {
        if (
          typeof entry !== "object" ||
          entry === null ||
          !("prompt" in entry) ||
          !("duration" in entry) ||
          typeof entry.prompt !== "string" ||
          typeof entry.duration !== "number"
        ) {
          return [];
        }
        return [{ prompt: entry.prompt.trim(), duration: entry.duration }];
      });
      continue;
    }

    if (
      rawValue === null ||
      typeof rawValue === "string" ||
      typeof rawValue === "number" ||
      typeof rawValue === "boolean"
    ) {
      normalized[field.id] = rawValue;
    }
  }

  return normalized;
}

function expressionMatches(
  expression: ConstraintExpression,
  values: Readonly<Record<string, unknown>>,
): boolean {
  switch (expression.operator) {
    case "equals":
      return values[expression.field] === expression.value;
    case "in":
      return expression.values.includes(
        values[expression.field] as ParameterValue,
      );
    case "allOf":
      return expression.expressions.every((entry) =>
        expressionMatches(entry, values),
      );
    case "anyOf":
      return expression.expressions.some((entry) =>
        expressionMatches(entry, values),
      );
    case "not":
      return !expressionMatches(expression.expression, values);
  }
}

function fieldIsVisible(
  field: FieldDefinition,
  values: Readonly<Record<string, unknown>>,
): boolean {
  return field.visibleWhen === undefined || expressionMatches(field.visibleWhen, values);
}

function issue(
  field: string,
  code: ValidationIssue["code"],
  message: string,
): ValidationIssue {
  return { field, code, message, severity: "error" };
}

function validateShotList(
  field: Extract<FieldDefinition, { kind: "shot-list" }>,
  value: unknown,
  values: Readonly<Record<string, unknown>>,
): readonly ValidationIssue[] {
  if (!Array.isArray(value)) {
    return [issue(field.id, "invalid_type", `${field.label}必须是分镜列表。`)];
  }
  const issues: ValidationIssue[] = [];
  if (value.length < field.minItems || value.length > field.maxItems) {
    issues.push(
      issue(
        field.id,
        "out_of_range",
        `${field.label}需要 ${field.minItems}–${field.maxItems} 个分镜。`,
      ),
    );
  }
  let totalDuration = 0;
  value.forEach((entry, index) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("prompt" in entry) ||
      !("duration" in entry) ||
      typeof entry.prompt !== "string" ||
      entry.prompt.trim().length === 0 ||
      entry.prompt.length > field.promptMaxLength ||
      typeof entry.duration !== "number" ||
      !Number.isInteger(entry.duration) ||
      entry.duration <= 0
    ) {
      issues.push(
        issue(
          field.id,
          "invalid_value",
          `${field.label}第 ${index + 1} 项的提示词或时长无效。`,
        ),
      );
      return;
    }
    totalDuration += entry.duration;
  });
  if (
    issues.length === 0 &&
    field.sumDurationEqualsField !== undefined &&
    totalDuration !== values[field.sumDurationEqualsField]
  ) {
    issues.push(
      issue(
        field.id,
        "incompatible",
        `${field.label}的时长之和必须等于总时长。`,
      ),
    );
  }
  return issues;
}

function validateField(
  field: FieldDefinition,
  value: unknown,
  values: Readonly<Record<string, unknown>>,
): readonly ValidationIssue[] {
  if (!fieldIsVisible(field, values)) {
    return [];
  }
  if (field.enabled === false && value !== undefined && value !== field.defaultValue) {
    return [
      issue(
        field.id,
        "disabled",
        field.disabledReason ?? `${field.label}当前不可提交。`,
      ),
    ];
  }
  if (value === undefined || value === null) {
    return field.required
      ? [issue(field.id, "required", `${field.label}为必填项。`)]
      : [];
  }

  if (field.kind === "text") {
    if (typeof value !== "string") {
      return [issue(field.id, "invalid_type", `${field.label}必须是文本。`)];
    }
    const issues: ValidationIssue[] = [];
    const trimmedLength = value.trim().length;
    if (field.required && trimmedLength === 0) {
      issues.push(issue(field.id, "required", `${field.label}不能为空。`));
    }
    if (
      field.minLength !== undefined &&
      trimmedLength < field.minLength &&
      !(field.required && trimmedLength === 0)
    ) {
      issues.push(
        issue(
          field.id,
          "out_of_range",
          `${field.label}至少需要 ${field.minLength} 个字符。`,
        ),
      );
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) {
      issues.push(
        issue(
          field.id,
          "out_of_range",
          `${field.label}不能超过 ${field.maxLength} 个字符。`,
        ),
      );
    }
    return issues;
  }

  if (field.kind === "enum") {
    return field.options.some((option) => option.value === value)
      ? []
      : [issue(field.id, "invalid_value", `${field.label}不是受支持的选项。`)];
  }

  if (field.kind === "integer" || field.kind === "number") {
    if (
      typeof value !== "number" ||
      (field.kind === "integer" && !Number.isInteger(value))
    ) {
      return [
        issue(
          field.id,
          "invalid_type",
          `${field.label}必须是${field.kind === "integer" ? "整数" : "数字"}。`,
        ),
      ];
    }
    if (
      (field.min !== undefined && value < field.min) ||
      (field.max !== undefined && value > field.max)
    ) {
      return [issue(field.id, "out_of_range", `${field.label}超出允许范围。`)];
    }
    return [];
  }

  if (field.kind === "boolean") {
    return typeof value === "boolean"
      ? []
      : [issue(field.id, "invalid_type", `${field.label}必须是布尔值。`)];
  }

  return validateShotList(field, value, values);
}

function constraintIssue(
  constraint: ConstraintDefinition,
): ValidationIssue {
  return {
    field: constraint.primaryField,
    code: constraint.code,
    message: constraint.message,
    severity: constraint.severity,
    constraintId: constraint.id,
  };
}

export function validateCapabilityDraft(
  capabilityId: string,
  draft: Readonly<Record<string, unknown>>,
): ValidationResult {
  const capability = getCapability(capabilityId);
  const fieldIds = new Set(capability.fields.map((field) => field.id));
  const issues: ValidationIssue[] = [];

  for (const key of Object.keys(draft)) {
    if (!fieldIds.has(key)) {
      issues.push(
        issue(key, "unknown_field", `参数 ${key} 不属于此能力。`),
      );
    }
  }
  for (const field of capability.fields) {
    issues.push(...validateField(field, draft[field.id], draft));
  }

  const fieldsWithErrors = new Set(
    issues
      .filter((entry) => entry.severity === "error")
      .map((entry) => entry.field),
  );
  for (const constraint of capability.constraints) {
    if (
      constraint.fieldIds.every((fieldId) => !fieldsWithErrors.has(fieldId)) &&
      expressionMatches(constraint.when, draft)
    ) {
      issues.push(constraintIssue(constraint));
    }
  }

  return {
    valid: !issues.some((entry) => entry.severity === "error"),
    issues,
  };
}

function inputCount(value: InputBindingValue): number {
  if (Array.isArray(value)) {
    return value.filter((item) => item.length > 0).length;
  }
  return typeof value === "string" && value.length > 0 ? 1 : 0;
}

export function validateInputBindings(
  capabilityId: string,
  bindings: Readonly<Record<string, InputBindingValue>>,
): ValidationResult {
  const capability = getCapability(capabilityId);
  const slotIds = new Set(capability.inputSlots.map((slot) => slot.id));
  const counts = Object.fromEntries(
    capability.inputSlots.map((slot) => [slot.id, inputCount(bindings[slot.id])]),
  );
  const issues: ValidationIssue[] = [];

  for (const key of Object.keys(bindings)) {
    if (!slotIds.has(key)) {
      issues.push(
        issue(key, "unknown_field", `输入槽位 ${key} 不属于此能力。`),
      );
    }
  }
  for (const slotDefinition of capability.inputSlots) {
    const count = counts[slotDefinition.id] ?? 0;
    if (slotDefinition.required && count < slotDefinition.minItems) {
      issues.push(
        issue(slotDefinition.id, "required", `${slotDefinition.label}需要绑定素材。`),
      );
    } else if (
      count < slotDefinition.minItems ||
      (slotDefinition.maxItems !== null && count > slotDefinition.maxItems)
    ) {
      const maximumLabel = slotDefinition.maxItems ?? "未限定";
      issues.push(
        issue(
          slotDefinition.id,
          "out_of_range",
          `${slotDefinition.label}需要 ${slotDefinition.minItems}–${maximumLabel} 个素材。`,
        ),
      );
    }
  }
  for (const constraint of capability.inputConstraints ?? []) {
    if (constraint.kind === "minimum_total") {
      const total = constraint.slotIds.reduce(
        (sum, slotId) => sum + (counts[slotId] ?? 0),
        0,
      );
      if (total < constraint.minimum) {
        issues.push(
          issue(constraint.primarySlot, "required", constraint.message),
        );
      }
    } else if (
      (counts[constraint.ifSlot] ?? 0) > 0 &&
      !constraint.requiredSlotIds.some((slotId) => (counts[slotId] ?? 0) > 0)
    ) {
      issues.push(
        issue(constraint.primarySlot, "incompatible", constraint.message),
      );
    }
  }

  return {
    valid: !issues.some((entry) => entry.severity === "error"),
    issues,
  };
}

function conditionsMatch(
  conditions: readonly PricingCondition[],
  values: Readonly<Record<string, unknown>>,
): boolean {
  return conditions.every((condition) => values[condition.field] === condition.equals);
}

export type CostEstimate =
  | Readonly<{ kind: "exact"; currency: "CNY"; amount: number }>
  | Readonly<{ kind: "unknown"; currency: "CNY"; reason: string }>;

export function estimateCapabilityCost(
  capabilityId: string,
  values: Readonly<Record<string, unknown>>,
  usage?: Readonly<{
    outputSeconds: number;
    inputVideoSeconds: number;
    inputImageCount: number;
  }>,
): CostEstimate {
  const pricing = getCapability(capabilityId).pricing;
  if (pricing.kind === "exact" && pricing.calculation === undefined) {
    return { kind: "exact", currency: "CNY", amount: pricing.amount };
  }
  const calculation = pricing.calculation;
  if (calculation === undefined) {
    return {
      kind: "unknown",
      currency: "CNY",
      reason: pricing.kind === "unknown" ? pricing.reason : "缺少可计算的价格规则。",
    };
  }
  if (calculation.kind === "lookup_table") {
    const row = calculation.rows.find((entry) =>
      conditionsMatch(entry.when, values),
    );
    return row
      ? { kind: "exact", currency: "CNY", amount: row.amount }
      : { kind: "unknown", currency: "CNY", reason: "当前参数组合没有价格证据。" };
  }
  if (calculation.kind === "per_second_table") {
    const duration = values.duration;
    const row = calculation.rows.find((entry) =>
      conditionsMatch(entry.when, values),
    );
    return typeof duration === "number" && row !== undefined
      ? {
          kind: "exact",
          currency: "CNY",
          amount: duration * row.ratePerSecond,
        }
      : { kind: "unknown", currency: "CNY", reason: "缺少时长或费率证据。" };
  }
  if (usage === undefined || typeof values.resolution !== "string") {
    return {
      kind: "unknown",
      currency: "CNY",
      reason: "复合计费需要输入媒体用量。",
    };
  }
  let amount = 0;
  for (const component of calculation.components) {
    const rate = component.ratesByResolution[values.resolution];
    if (rate === undefined) {
      return { kind: "unknown", currency: "CNY", reason: "当前分辨率没有价格证据。" };
    }
    if (component.quantity === "output_seconds") {
      amount += usage.outputSeconds * rate;
    } else if (component.quantity === "input_video_seconds") {
      amount += usage.inputVideoSeconds * rate;
    } else {
      amount += Math.max(0, usage.inputImageCount - (component.freeAllowance ?? 0)) * rate;
    }
  }
  return { kind: "exact", currency: "CNY", amount };
}
