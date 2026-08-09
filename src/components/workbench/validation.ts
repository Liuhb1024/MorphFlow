import type {
  CapabilityView,
  ParameterValues,
  ValidationIssue,
} from "./types";

export function defaultsFor(capability: CapabilityView): ParameterValues {
  return Object.fromEntries(
    capability.fields.flatMap((field) =>
      field ? [[field.id, field.defaultValue] as const] : [],
    ),
  );
}

export function validateDraft(
  capability: CapabilityView,
  values: ParameterValues,
): ValidationIssue[] {
  const issues: ValidationIssue[] = capability.constraints
    .filter((constraint) =>
      constraint.when.every(({ fieldId, equals }) => values[fieldId] === equals),
    )
    .map(({ id, severity, message, fieldIds }) => ({
      id,
      severity,
      message,
      fieldIds,
    }));

  const promptField = capability.fields.find(
    (field) => field.kind === "text" && field.id === "prompt" && field.required,
  );
  if (promptField && String(values.prompt ?? "").trim().length === 0) {
    issues.push({
      id: "prompt-required",
      severity: "error",
      message: "请填写镜头提示词后再复核。",
      fieldIds: ["prompt"],
    });
  }

  for (const field of capability.fields) {
    if (!field) continue;
    if (
      field.kind === "number" &&
      field.integer &&
      values[field.id] !== "" &&
      !Number.isInteger(Number(values[field.id]))
    ) {
      issues.push({
        id: `${field.id}-integer`,
        severity: "error",
        message: `${field.label}必须是整数或留空。`,
        fieldIds: [field.id],
      });
    }
    if (field.kind === "shot-list") {
      const shots = values[field.id];
      if (
        !Array.isArray(shots) ||
        shots.length < field.minItems ||
        shots.length > field.maxItems ||
        shots.some(
          (shot) =>
            shot.prompt.trim().length === 0 ||
            shot.prompt.length > field.promptMaxLength ||
            !Number.isInteger(shot.duration) ||
            shot.duration <= 0,
        )
      ) {
        issues.push({
          id: `${field.id}-invalid-shots`,
          severity: "error",
          message: `${field.label}需要 ${field.minItems}–${field.maxItems} 个有效镜头。`,
          fieldIds: [field.id],
        });
      }
    }
  }

  return issues;
}
