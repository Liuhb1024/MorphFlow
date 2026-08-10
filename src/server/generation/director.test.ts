import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { openMorphFlowDatabase } from "../db/connection";
import { storeLocalAsset } from "../media/local-store";
import { ProjectRepository } from "../projects/repository";
import { generateDirectorAdvice } from "./director";

const dirs: string[] = [];
const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]);
async function* bytes() { yield Uint8Array.from(png); }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("generateDirectorAdvice", () => {
  it("sends ordered real images to Gemini and returns its editable advice", async () => {
    const root = mkdtempSync(join(tmpdir(), "morphflow-director-")); dirs.push(root);
    const database = openMorphFlowDatabase({ filename: join(root, "db.sqlite") });
    const project = new ProjectRepository(database).createProject({ name: "director" });
    const image = await storeLocalAsset({ database, dataRoot: root, projectId: project.id, kind: "first_frame", originalFilename: "a.png", declaredMime: "image/png", stream: bytes() });
    const postJson = vi.fn().mockResolvedValue({ choices: [{ message: { content: "缓慢推进，保持主体连续。" } }] });
    const advice = await generateDirectorAdvice({ database, dataRoot: root, client: { postJson }, projectId: project.id, assetIds: [image.id], prompt: "做一个能量转场" });
    expect(advice).toBe("缓慢推进，保持主体连续。");
    expect(postJson).toHaveBeenCalledWith("/v1/chat/completions", expect.objectContaining({ model: "gemini-3.6-flash" }), expect.objectContaining({ authorization: "bare" }));
    database.close();
  });
});
