import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { openMorphFlowDatabase } from "../db/connection";
import { storeLocalAsset } from "../media/local-store";
import { ProjectRepository } from "../projects/repository";
import { imagePromptSystem, optimizeImagePrompt, videoPromptSystem } from "./prompt-optimizer";

const directories: string[] = [];
const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
async function* bytes() { yield Uint8Array.from(png); }
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("prompt policies", () => {
  it("keeps image editing faithful to the reference and its aspect ratio", () => {
    const policy = imagePromptSystem("16:9");
    expect(policy).toContain("保持参考图的宽高比 16:9");
    expect(policy).toContain("必须保留");
    expect(policy).toContain("不要堆砌");
  });

  it("adapts video rewriting to image-to-video and endpoint continuity", () => {
    const policy = videoPromptSystem("kling-v3:first-last-frame", { audio: false, duration: 5 });
    expect(policy).toContain("只描述相对于输入画面发生的变化");
    expect(policy).toContain("首帧 A");
    expect(policy).toContain("尾帧 B");
    expect(policy).toContain("5 秒");
    expect(policy).toContain("可灵");
  });

  it("does not invent sound when the selected mode has audio disabled", () => {
    expect(videoPromptSystem("paiwo-v5.6-itv:image-to-video", { audio: false, duration: 8 })).toContain("不要添加声音");
  });

  it("sends the selected local reference image and aspect to the VLM", async () => {
    const root = mkdtempSync(join(tmpdir(), "morphflow-prompt-"));
    directories.push(root);
    const database = openMorphFlowDatabase({ filename: join(root, "db.sqlite") });
    const project = new ProjectRepository(database).createProject({ name: "prompt" });
    const image = await storeLocalAsset({ database, dataRoot: root, projectId: project.id, kind: "reference_image", originalFilename: "reference.png", declaredMime: "image/png", stream: bytes() });
    const postJson = vi.fn().mockResolvedValue({ choices: [{ message: { content: "保留人物身份与构图，增加蓝色能量光。" } }] });
    const result = await optimizeImagePrompt({ database, dataRoot: root, client: { postJson }, projectId: project.id, referenceAssetIds: [image.id], draft: "加点蓝色光", aspectRatio: "16:9" });
    expect(result).toBe("保留人物身份与构图，增加蓝色能量光。");
    const payload = postJson.mock.calls[0]?.[1] as { messages: Array<{ content: Array<{ type: string; text?: string }> }> };
    expect(payload.messages[0]?.content[0]?.text).toContain("保持参考图的宽高比 16:9");
    expect(payload.messages[0]?.content[1]?.type).toBe("image_url");
    database.close();
  });
});
