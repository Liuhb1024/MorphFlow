export type CapabilityCategory = "image" | "video" | "vlm";

export type CapabilityMaturity = "documented" | "tested" | "disabled";

export type EvidenceStatus =
  | "documented"
  | "conflicting"
  | "unknown"
  | "needs_live_test";

export type InputRole =
  | "first_frame"
  | "last_frame"
  | "reference_image"
  | "reference_video"
  | "reference_audio"
  | "subject_image"
  | "mask"
  | "sketch";

export type InputKind = "image" | "video" | "audio";

export type ShotValue = Readonly<{
  prompt: string;
  duration: number;
}>;

export type ParameterValue =
  | string
  | number
  | boolean
  | null
  | readonly ShotValue[];

export type EvidenceReference = Readonly<{
  status: EvidenceStatus;
  source: "local_provider_documentation" | "controlled_live_test";
  reviewedAt: string;
  note: string;
}>;

export type InputSlotDefinition = Readonly<{
  id: string;
  role: InputRole;
  label: string;
  description: string;
  accepts: readonly InputKind[];
  required: boolean;
  minItems: number;
  maxItems: number | null;
  limits?: Readonly<{
    formats?: readonly string[];
    maxBytes?: number;
    minWidth?: number;
    minHeight?: number;
    maxDimension?: number;
    minDurationSeconds?: number;
    maxDurationSeconds?: number;
    maxTotalDurationSeconds?: number;
    aspectRatioRange?: readonly [number, number];
    note?: string;
  }>;
}>;

type FieldBase = Readonly<{
  id: string;
  label: string;
  description: string;
  group: "common" | "advanced";
  required: boolean;
  availability?: EvidenceStatus;
  enabled?: boolean;
  disabledReason?: string;
  visibleWhen?: ConstraintExpression;
}>;

export type TextFieldDefinition = FieldBase &
  Readonly<{
    kind: "text";
    defaultValue: string;
    minLength?: number;
    maxLength?: number;
    multiline?: boolean;
  }>;

export type EnumOption = Readonly<{
  value: string | number;
  label: string;
}>;

export type EnumFieldDefinition = FieldBase &
  Readonly<{
    kind: "enum";
    defaultValue: string | number;
    options: readonly EnumOption[];
  }>;

export type IntegerFieldDefinition = FieldBase &
  Readonly<{
    kind: "integer";
    defaultValue: number | null;
    min?: number;
    max?: number;
    step?: number;
  }>;

export type NumberFieldDefinition = FieldBase &
  Readonly<{
    kind: "number";
    defaultValue: number | null;
    min?: number;
    max?: number;
    step?: number;
  }>;

export type BooleanFieldDefinition = FieldBase &
  Readonly<{
    kind: "boolean";
    defaultValue: boolean;
  }>;

export type ShotListFieldDefinition = FieldBase &
  Readonly<{
    kind: "shot-list";
    defaultValue: readonly ShotValue[];
    minItems: number;
    maxItems: number;
    promptMaxLength: number;
    sumDurationEqualsField?: string;
  }>;

export type FieldDefinition =
  | TextFieldDefinition
  | EnumFieldDefinition
  | IntegerFieldDefinition
  | NumberFieldDefinition
  | ShotListFieldDefinition
  | BooleanFieldDefinition;

export type ConstraintExpression =
  | Readonly<{
      operator: "equals";
      field: string;
      value: ParameterValue;
    }>
  | Readonly<{
      operator: "in";
      field: string;
      values: readonly ParameterValue[];
    }>
  | Readonly<{
      operator: "allOf" | "anyOf";
      expressions: readonly ConstraintExpression[];
    }>
  | Readonly<{
      operator: "not";
      expression: ConstraintExpression;
    }>;

export type ConstraintDefinition = Readonly<{
  id: string;
  when: ConstraintExpression;
  fieldIds: readonly string[];
  primaryField: string;
  severity: "error" | "warning";
  code: "incompatible";
  message: string;
}>;

export type PricingEvidence = Readonly<{
  status: EvidenceStatus;
  label: string;
}>;

export type PricingCondition = Readonly<{
  field: string;
  equals: string | number | boolean;
}>;

export type PricingCalculation =
  | Readonly<{
      kind: "lookup_table";
      selectors: readonly string[];
      rows: readonly Readonly<{
        when: readonly PricingCondition[];
        amount: number;
      }>[];
    }>
  | Readonly<{
      kind: "per_second_table";
      selectors: readonly string[];
      rows: readonly Readonly<{
        when: readonly PricingCondition[];
        ratePerSecond: number;
      }>[];
    }>
  | Readonly<{
      kind: "compound";
      components: readonly Readonly<{
        label: string;
        quantity:
          | "output_seconds"
          | "input_video_seconds"
          | "input_images_over_free_allowance";
        ratesByResolution: Readonly<Record<string, number>>;
        freeAllowance?: number;
      }>[];
    }>;

type PricingBase = Readonly<{
  currency: "CNY";
  evidence: PricingEvidence;
  calculation?: PricingCalculation;
}>;

export type PricingDefinition =
  | (PricingBase & Readonly<{
      kind: "exact";
      amount: number;
    }>)
  | (PricingBase & Readonly<{
      kind: "range";
      minimum: number;
      maximum: number;
    }>)
  | (PricingBase & Readonly<{
      kind: "unknown";
      reason: string;
    }>);

export type CapabilityModeId =
  | "director"
  | "reference-image-edit"
  | "text-to-video"
  | "image-to-video"
  | "last-frame-to-video"
  | "first-last-frame"
  | "text-multi-shot"
  | "image-multi-shot"
  | "subject-control"
  | "multimodal-reference"
  | "reference-to-video";

export type ModelModeDefinition = Readonly<{
  id: string;
  modelId: string;
  modelLabel: string;
  modeId: CapabilityModeId;
  modeLabel: string;
  category: CapabilityCategory;
  description: string;
  inputSlots: readonly InputSlotDefinition[];
  inputConstraints?: readonly InputConstraintDefinition[];
  fields: readonly FieldDefinition[];
  constraints: readonly ConstraintDefinition[];
  pricing: PricingDefinition;
  evidence: readonly EvidenceReference[];
  maturity: CapabilityMaturity;
  registryVersion: number;
}>;

export type InputConstraintDefinition =
  | Readonly<{
      kind: "minimum_total";
      slotIds: readonly string[];
      minimum: number;
      primarySlot: string;
      message: string;
    }>
  | Readonly<{
      kind: "requires_any_if_present";
      ifSlot: string;
      requiredSlotIds: readonly string[];
      primarySlot: string;
      message: string;
    }>;

export type ValidationIssueCode =
  | "required"
  | "invalid_type"
  | "invalid_value"
  | "out_of_range"
  | "unknown_field"
  | "disabled"
  | "incompatible";

export type ValidationIssue = Readonly<{
  field: string;
  code: ValidationIssueCode;
  message: string;
  severity: "error" | "warning";
  constraintId?: string;
}>;

export type ValidationResult = Readonly<{
  valid: boolean;
  issues: readonly ValidationIssue[];
}>;

export type InputBindingValue = string | readonly string[] | null | undefined;
