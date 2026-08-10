import { describe, expect, it } from "vitest";

import {
  createCapabilityDefaults,
  estimateCapabilityCost,
  getCapability,
  listCapabilities,
  normalizeCapabilityDraft,
  validateInputBindings,
  validateCapabilityDraft,
} from "./registry";

describe("model registry", () => {
  it("registers every locally documented MVP model family and its distinct modes", () => {
    expect(listCapabilities().map((capability) => capability.id)).toEqual([
      "gemini-3.6-flash:director",
      "gpt-image-2-03:reference-image-edit",
      "kling-v3:text-to-video",
      "kling-v3:image-to-video",
      "kling-v3:first-last-frame",
      "kling-v3:text-multi-shot",
      "kling-v3:image-multi-shot",
      "kling-v3:subject-control",
      "viduq3-pro:image-to-video",
      "viduq3-pro:first-last-frame",
      "MiniMax-H3:image-to-video",
      "MiniMax-H3:last-frame-to-video",
      "MiniMax-H3:first-last-frame",
      "MiniMax-H3:multimodal-reference",
      "happyhorse-1.1-i2v:image-to-video",
      "happyhorse-1.1-r2v:reference-to-video",
      "paiwo-v5.6-itv:image-to-video",
      "paiwo-v5.6-itv2:first-last-frame",
    ]);
  });

  it("exposes implemented documented protocols while keeping unsupported subject control disabled", () => {
    const gemini = getCapability("gemini-3.6-flash:director");
    const gptImage = getCapability("gpt-image-2-03:reference-image-edit");
    const vidu = getCapability("viduq3-pro:first-last-frame");
    const klingSubject = getCapability("kling-v3:subject-control");

    expect(gemini.maturity).toBe("documented");
    expect(gemini.pricing.kind).toBe("unknown");
    expect(gptImage.maturity).toBe("documented");
    expect(gptImage.evidence.map((item) => item.status)).toContain(
      "conflicting",
    );
    expect(vidu.maturity).toBe("documented");
    expect(klingSubject.maturity).toBe("disabled");
  });

  it("describes dynamic reference-media bounds without inventing unknown maxima", () => {
    const imageEdit = getCapability("gpt-image-2-03:reference-image-edit");
    const happyReference = getCapability(
      "happyhorse-1.1-r2v:reference-to-video",
    );
    const h3 = getCapability("MiniMax-H3:multimodal-reference");

    expect(imageEdit.inputSlots[0]).toMatchObject({
      role: "reference_image",
      minItems: 1,
      maxItems: null,
    });
    expect(happyReference.inputSlots[0]).toMatchObject({
      role: "reference_image",
      minItems: 1,
      maxItems: 9,
    });
    expect(h3.inputSlots.map(({ role, maxItems }) => ({ role, maxItems }))).toEqual(
      [
        { role: "reference_image", maxItems: 9 },
        { role: "reference_video", maxItems: 3 },
        { role: "reference_audio", maxItems: 3 },
      ],
    );
  });

  it("retains documented model-specific parameter ranges and options", () => {
    const kling = getCapability("kling-v3:text-to-video");
    const gptImage = getCapability("gpt-image-2-03:reference-image-edit");
    const happyHorse = getCapability(
      "happyhorse-1.1-r2v:reference-to-video",
    );

    expect(kling.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "cfgScale", min: 0, max: 1 }),
        expect.objectContaining({ id: "duration", min: 3, max: 15 }),
      ]),
    );
    expect(gptImage.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "n", defaultValue: 1 }),
        expect.objectContaining({
          id: "outputCompression",
          min: 0,
          max: 100,
        }),
      ]),
    );
    const ratioField = happyHorse.fields.find((field) => field.id === "ratio");
    expect(
      ratioField?.kind === "enum"
        ? ratioField.options.map((option) => option.value)
        : [],
    ).toEqual([
      "16:9",
      "9:16",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "1:1",
      "9:21",
      "21:9",
    ]);
  });

  it("stores documented pricing formulas with evidence instead of flattening rates", () => {
    const gptImage = getCapability("gpt-image-2-03:reference-image-edit");
    const kling = getCapability("kling-v3:text-to-video");
    const h3 = getCapability("MiniMax-H3:multimodal-reference");
    const paiwo = getCapability("paiwo-v5.6-itv:image-to-video");

    expect(gptImage.pricing).toMatchObject({
      kind: "exact",
      amount: 0.3,
      evidence: { status: "needs_live_test" },
    });
    expect(kling.pricing.calculation?.kind).toBe("per_second_table");
    expect(h3.pricing.calculation?.kind).toBe("compound");
    expect(paiwo.pricing.calculation).toMatchObject({
      kind: "lookup_table",
      selectors: ["duration", "audio", "resolution"],
    });
  });

  it("calculates only parameter combinations backed by local pricing evidence", () => {
    expect(
      estimateCapabilityCost("paiwo-v5.6-itv:image-to-video", {
        duration: 5,
        audio: false,
        resolution: "540p",
      }),
    ).toEqual({ kind: "exact", currency: "CNY", amount: 0.7245 });
    expect(
      estimateCapabilityCost("kling-v3:text-to-video", {
        duration: 3,
        modelMode: "std",
        audio: false,
      }),
    ).toEqual({ kind: "exact", currency: "CNY", amount: 1.422 });
    expect(
      estimateCapabilityCost(
        "MiniMax-H3:multimodal-reference",
        { resolution: "768P" },
        { outputSeconds: 4, inputVideoSeconds: 2, inputImageCount: 6 },
      ),
    ).toEqual({ kind: "exact", currency: "CNY", amount: 3.2 });
    expect(
      estimateCapabilityCost("paiwo-v5.6-itv2:first-last-frame", {
        duration: 5,
      }).kind,
    ).toBe("unknown");
  });

  it("checks H3 multimodal media presence and forbids audio-only reference", () => {
    expect(
      validateInputBindings("MiniMax-H3:multimodal-reference", {}).valid,
    ).toBe(false);
    const audioOnly = validateInputBindings(
      "MiniMax-H3:multimodal-reference",
      { referenceAudios: ["audio-a"] },
    );
    expect(audioOnly.issues).toContainEqual(
      expect.objectContaining({
        field: "referenceAudios",
        code: "incompatible",
      }),
    );
  });

  it("checks custom Kling shot count, content and duration sum", () => {
    const values = {
      ...createCapabilityDefaults("kling-v3:text-multi-shot"),
      shotType: "customize",
      duration: 5,
      shots: [{ prompt: "Opening", duration: 4 }],
    };
    const result = validateCapabilityDraft(
      "kling-v3:text-multi-shot",
      values,
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({ field: "shots", code: "incompatible" }),
    );
  });

  it.each([
    "kling-v3:image-to-video",
    "kling-v3:first-last-frame",
  ])("requires a prompt for documented Kling image mode %s", (capabilityId) => {
    const result = validateCapabilityDraft(capabilityId, {
      ...createCapabilityDefaults(capabilityId),
      prompt: "",
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ field: "prompt", code: "required" }),
    );
  });

  it("describes Paiwo ITV and ITV2 as different input modes", () => {
    const itv = getCapability("paiwo-v5.6-itv:image-to-video");
    const itv2 = getCapability("paiwo-v5.6-itv2:first-last-frame");

    expect(itv.inputSlots.map((slot) => slot.role)).toEqual(["first_frame"]);
    expect(itv2.inputSlots.map((slot) => slot.role)).toEqual([
      "first_frame",
      "last_frame",
    ]);
  });

  it("lists capabilities without exposing provider endpoints", () => {
    const serialized = JSON.stringify(listCapabilities());

    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toContain("Authorization");
  });

  it("builds defaults from dynamic field definitions", () => {
    expect(createCapabilityDefaults("paiwo-v5.6-itv:image-to-video")).toEqual({
      prompt: "",
      duration: 5,
      resolution: "540p",
      motionMode: "normal",
      audio: false,
      seed: null,
      negativePrompt: "",
    });

    const itv2 = getCapability("paiwo-v5.6-itv2:first-last-frame");
    expect(itv2.fields.map((field) => field.id)).not.toContain("negativePrompt");
  });

  it("keeps unverified or unknown pricing evidence explicit", () => {
    const itv = getCapability("paiwo-v5.6-itv:image-to-video");
    const itv2 = getCapability("paiwo-v5.6-itv2:first-last-frame");

    expect(itv.pricing).toMatchObject({
      kind: "range",
      evidence: { status: "needs_live_test" },
    });
    expect(itv2.pricing).toMatchObject({
      kind: "unknown",
      evidence: { status: "unknown" },
    });
  });

  it("rejects Paiwo fast motion with an 8 second duration", () => {
    const result = validateCapabilityDraft("paiwo-v5.6-itv:image-to-video", {
      duration: 8,
      resolution: "720p",
      motionMode: "fast",
      audio: false,
      seed: 0,
      prompt: "The camera accelerates through a glowing portal.",
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ field: "motionMode", code: "incompatible" }),
    );
  });

  it("rejects Paiwo 1080p at 10 seconds", () => {
    const result = validateCapabilityDraft("paiwo-v5.6-itv2:first-last-frame", {
      duration: 10,
      resolution: "1080p",
      motionMode: "normal",
      audio: false,
      seed: 0,
      prompt: "A continuous transformation with no cut.",
    });

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ field: "resolution", code: "incompatible" }),
    );
  });

  it("validates declared field types and rejects hidden parameters", () => {
    const result = validateCapabilityDraft(
      "paiwo-v5.6-itv2:first-last-frame",
      {
        duration: 5,
        resolution: "540p",
        motionMode: "normal",
        audio: "false",
        seed: 1.5,
        prompt: "  ",
        negativePrompt: "this mode must not send this field",
      },
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "audio", code: "invalid_type" }),
        expect.objectContaining({ field: "seed", code: "invalid_type" }),
        expect.objectContaining({ field: "prompt", code: "required" }),
        expect.objectContaining({
          field: "negativePrompt",
          code: "unknown_field",
        }),
      ]),
    );
  });

  it("normalizes a cleared optional number to null without hiding invalid required numbers", () => {
    const optional = normalizeCapabilityDraft("happyhorse-1.1-i2v:image-to-video", {
      ...createCapabilityDefaults("happyhorse-1.1-i2v:image-to-video"),
      seed: "",
    });
    const required = normalizeCapabilityDraft("kling-v3:first-last-frame", {
      ...createCapabilityDefaults("kling-v3:first-last-frame"),
      cfgScale: "",
    });

    expect(optional.seed).toBeNull();
    expect(validateCapabilityDraft("happyhorse-1.1-i2v:image-to-video", optional).valid).toBe(true);
    expect(required.cfgScale).toBe("");
    expect(validateCapabilityDraft("kling-v3:first-last-frame", required).issues).toContainEqual(
      expect.objectContaining({ field: "cfgScale", code: "invalid_type" }),
    );
  });

  it("validates required input bindings for each mode", () => {
    expect(
      validateInputBindings("paiwo-v5.6-itv:image-to-video", {
        firstFrame: "asset-a",
      }).valid,
    ).toBe(true);

    const result = validateInputBindings(
      "paiwo-v5.6-itv2:first-last-frame",
      { firstFrame: "asset-a", lastFrame: null },
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ field: "lastFrame", code: "required" }),
    );
  });
});
