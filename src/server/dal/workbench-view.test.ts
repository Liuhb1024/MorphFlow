import { describe, expect, it } from "vitest";

import { createWorkbenchView } from "./workbench-view";

describe("createWorkbenchView", () => {
  it("keeps an empty project empty instead of injecting demo assets or shots", () => {
    const view = createWorkbenchView({
      project: { id: "project_empty", name: "空空间", description: "", revision: 1, createdAt: 1, updatedAt: 1 },
      shots: [],
      assets: [],
    });

    expect(view.assets).toEqual([]);
    expect(JSON.stringify(view)).not.toContain("fixture");
    expect(JSON.stringify(view)).not.toContain("demo");
    expect(view.capabilities.every((capability) => capability.inputSlots.every((slot) => slot.assetId === null))).toBe(true);
  });

  it("binds real local image assets into the full capability registry", () => {
    const view = createWorkbenchView({
      project: {
        id: "project_real",
        name: "真实项目",
        description: "",
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
      },
      shots: [
        {
          id: "shot_real",
          projectId: "project_real",
          position: 0,
          name: "镜头一",
          description: "",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      assets: [
        {
          id: "asset_a",
          projectId: "project_real",
          shotId: "shot_real",
          kind: "first_frame",
          source: "local_upload",
          displayName: "A.png",
          mimeType: "image/png",
          byteSize: 1_024,
          sha256: "a".repeat(64),
          width: 1280,
          height: 720,
          durationMs: null,
          fps: null,
          parentAssetId: null,
          createdAt: 1,
          contentUrl: "/api/assets/asset_a/content",
        },
        {
          id: "asset_b",
          projectId: "project_real",
          shotId: "shot_real",
          kind: "last_frame",
          source: "local_upload",
          displayName: "B.png",
          mimeType: "image/png",
          byteSize: 1_024,
          sha256: "b".repeat(64),
          width: 1280,
          height: 720,
          durationMs: null,
          fps: null,
          parentAssetId: null,
          createdAt: 2,
          contentUrl: "/api/assets/asset_b/content",
        },
      ],
    });

    expect(view.project).toMatchObject({ id: "project_real", name: "真实项目" });
    expect(view.assets.map((asset) => asset.src)).toEqual([
      "/api/assets/asset_a/content",
      "/api/assets/asset_b/content",
    ]);
    expect(view.capabilities).toHaveLength(15);
    expect(view.capabilities.every((capability) => capability.modeId !== "director")).toBe(true);
    expect(
      view.capabilities.find(
        (capability) => capability.id === "kling-v3:first-last-frame",
      )?.inputSlots.map((slot) => slot.assetId),
    ).toEqual(["asset_a", "asset_b"]);
  });
});
