export type AssetView = {
  id: string;
  label: string;
  role: "first-frame" | "last-frame" | "reference";
  sourceLabel: string;
  src: string;
  alt: string;
};

export type InputSlotView = {
  id: string;
  label: string;
  assetId: string | null;
  required: boolean;
};

type FieldBase = {
  id: string;
  label: string;
  description: string;
  group: "common" | "advanced";
  disabled?: boolean;
  disabledReason?: string;
};

export type ParameterFieldView =
  | (FieldBase & {
      kind: "text";
      defaultValue: string;
      multiline?: boolean;
      required?: boolean;
      placeholder?: string;
    })
  | (FieldBase & {
      kind: "number";
      defaultValue: number | "";
      integer?: boolean;
      min?: number;
      max?: number;
      step?: number;
    })
  | (FieldBase & {
      kind: "boolean";
      defaultValue: boolean;
      warning?: string;
    })
  | (FieldBase & {
      kind: "enum";
      defaultValue: string | number;
      options: ReadonlyArray<{ label: string; value: string | number }>;
    })
  | (FieldBase & {
      kind: "shot-list";
      defaultValue: ShotParameterValue[];
      minItems: number;
      maxItems: number;
      promptMaxLength: number;
    });

export type ConstraintView = {
  id: string;
  severity: "error" | "warning";
  message: string;
  fieldIds: string[];
  when: ReadonlyArray<{ fieldId: string; equals: string | number | boolean }>;
};

export type PricingView =
  | { kind: "exact"; amountCny: number; evidenceLabel: string }
  | {
      kind: "range";
      minCny: number;
      maxCny: number;
      evidenceLabel: string;
    }
  | { kind: "unknown"; reason: string; evidenceLabel: string };

export type CapabilityView = {
  id: string;
  modelId: string;
  modelLabel: string;
  modeId: string;
  modeLabel: string;
  verification: "documented" | "tested" | "disabled";
  definitionVersion: string;
  inputSlots: InputSlotView[];
  fields: ParameterFieldView[];
  constraints: ConstraintView[];
  pricing: PricingView;
  omittedFieldNote?: string;
};

export type WorkbenchViewModel = {
  project: {
    id: string;
    name: string;
    eyebrow: string;
  };
  assets: AssetView[];
  capabilities: CapabilityView[];
  initialCapabilityId: string;
};

export type ShotParameterValue = { prompt: string; duration: number };
export type ParameterValue = string | number | boolean | ShotParameterValue[];
export type ParameterValues = Record<string, ParameterValue>;

export type ValidationIssue = {
  id: string;
  severity: "error" | "warning";
  message: string;
  fieldIds: string[];
};
