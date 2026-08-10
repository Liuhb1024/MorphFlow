import type {
  CapabilityView,
  ParameterValues,
  ValidationIssue,
} from "./types";
import {
  normalizeCapabilityDraft,
  validateCapabilityDraft,
} from "@/model-registry/registry";

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
  const normalized = normalizeCapabilityDraft(capability.id, values);
  return validateCapabilityDraft(capability.id, normalized).issues.map(
    (issue, index) => {
      const constraint = issue.constraintId
        ? capability.constraints.find((item) => item.id === issue.constraintId)
        : undefined;
      return {
        id: issue.constraintId ?? `${issue.field}-${issue.code}-${index}`,
        severity: issue.severity,
        message: issue.message,
        fieldIds: constraint?.fieldIds ?? [issue.field],
      };
    },
  );
}
