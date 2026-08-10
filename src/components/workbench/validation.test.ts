import { describe, expect, it } from "vitest";

import { createCapabilityDefaults, getCapability } from "@/model-registry/registry";

import { toCapabilityViews } from "./registry-view";
import { validateDraft } from "./validation";

const capabilityId = "kling-v3:first-last-frame";

function klingView() {
  const [view] = toCapabilityViews([getCapability(capabilityId)], {});
  if (!view) throw new Error("missing Kling capability view");
  return view;
}

describe("workbench draft validation", () => {
  it("rejects a cleared required number before the paid submission dialog opens", () => {
    const values = { ...createCapabilityDefaults(capabilityId), cfgScale: "" };

    expect(validateDraft(klingView(), values)).toContainEqual(
      expect.objectContaining({
        severity: "error",
        message: "提示词相关性必须是数字。",
        fieldIds: ["cfgScale"],
      }),
    );
  });

  it("uses the registry range rules instead of accepting an invalid browser value", () => {
    const values = { ...createCapabilityDefaults(capabilityId), cfgScale: 2 };

    expect(validateDraft(klingView(), values)).toContainEqual(
      expect.objectContaining({
        severity: "error",
        message: "提示词相关性超出允许范围。",
        fieldIds: ["cfgScale"],
      }),
    );
  });
});
