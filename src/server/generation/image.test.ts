import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { openMorphFlowDatabase } from "../db/connection";
import { storeLocalAsset } from "../media/local-store";
import { ProjectRepository } from "../projects/repository";
import { generateEditedImage } from "./image";

const dirs: string[] = [];
const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3,4]);
async function* bytes() { yield Uint8Array.from(png); }

afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe("generateEditedImage", () => {
  it("sends real local references and stores the generated result as a new asset", async () => {
    const root = mkdtempSync(join(tmpdir(), "morphflow-image-generation-"));
    dirs.push(root);
    const database = openMorphFlowDatabase({ filename: join(root, "test.sqlite") });
    const project = new ProjectRepository(database).createProject({ name: "image" });
    const reference = await storeLocalAsset({ database, dataRoot: root, projectId: project.id, kind: "reference_image", originalFilename: "reference.png", declaredMime: "image/png", stream: bytes() });
    const postForm = vi.fn().mockResolvedValue({ data: [{ b64_json: png.toString("base64") }] });

    const result = await generateEditedImage({ database, dataRoot: root, client: { postForm }, projectId: project.id, referenceAssetIds: [reference.id], prompt: "增加电影级蓝色能量", size: "1024x1024", quality: "low", background: "auto", outputFormat: "png" });

    expect(result.kind).toBe("generated_image");
    expect(result.source).toBe("image_generation");
    const form = postForm.mock.calls[0]?.[1] as FormData;
    expect(form.get("model")).toBe("gpt-image-2-03");
    expect(form.getAll("image")).toHaveLength(1);
    database.close();
  });
});
