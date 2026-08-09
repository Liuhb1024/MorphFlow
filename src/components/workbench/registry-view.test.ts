import { describe, expect, it } from "vitest";

import { listCapabilities } from "@/model-registry/registry";

import { toCapabilityViews } from "./registry-view";

describe("toCapabilityViews", () => {
  it("projects the shared registry into safe dynamic UI capabilities", () => {
    const views = toCapabilityViews(listCapabilities(), {
      first_frame: "asset-frame-a",
      last_frame: "asset-frame-b",
    });

    expect(views).toHaveLength(18);
    expect(new Set(views.map((view) => view.modelId.split("-")[0])).size).toBeGreaterThan(4);

    const itv = views.find((view) => view.id === "paiwo-v5.6-itv:image-to-video");
    const itv2 = views.find((view) => view.id === "paiwo-v5.6-itv2:first-last-frame");
    expect(itv).toBeDefined();
    expect(itv2).toBeDefined();
    expect(itv?.fields.some((field) => field.id === "negativePrompt")).toBe(
      true,
    );
    expect(itv2?.fields.some((field) => field.id === "negativePrompt")).toBe(
      false,
    );
    expect(itv2?.inputSlots.map((slot) => slot.assetId)).toEqual([
      "asset-frame-a",
      "asset-frame-b",
    ]);
    expect(
      views.find((view) => view.id === "kling-v3:text-multi-shot")?.fields,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "shot-list" })]));
    expect(JSON.stringify(views)).not.toMatch(/https?:\/\/|Authorization|Bearer/);
  });
});
