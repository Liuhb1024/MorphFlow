// @vitest-environment node

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GET as getAssetContent } from "../../app/api/assets/[assetId]/content/route";
import {
  GET as listAssets,
  POST as uploadAsset,
} from "../../app/api/projects/[projectId]/assets/route";
import { openMorphFlowDatabase } from "../db/connection";
import { ProjectRepository } from "../projects/repository";

const directories: string[] = [];
const originalDataDirectory = process.env.MORPHFLOW_DATA_DIR;
const PNG_FIXTURE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52,
]);

afterEach(() => {
  if (originalDataDirectory === undefined) {
    delete process.env.MORPHFLOW_DATA_DIR;
  } else {
    process.env.MORPHFLOW_DATA_DIR = originalDataDirectory;
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("assets API", () => {
  it("accepts bounded multipart data and serves it by opaque asset id", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "morphflow-asset-api-"));
    directories.push(dataRoot);
    process.env.MORPHFLOW_DATA_DIR = dataRoot;
    const database = openMorphFlowDatabase({
      filename: join(dataRoot, "morphflow.sqlite"),
    });
    const project = new ProjectRepository(database).createProject({
      name: "上传 API",
    });
    database.close();

    const form = new FormData();
    form.set("kind", "source_image");
    form.set("file", new File([PNG_FIXTURE], "frame.png", { type: "image/png" }));
    const encodedRequest = new Request(
      `http://localhost:3000/api/projects/${project.id}/assets`,
      { method: "POST", body: form },
    );
    const encodedBody = await encodedRequest.arrayBuffer();
    const uploadRequest = new Request(encodedRequest.url, {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": encodedRequest.headers.get("content-type") ?? "",
        "content-length": String(encodedBody.byteLength),
      },
      body: encodedBody,
    });

    const uploaded = await uploadAsset(uploadRequest, {
      params: Promise.resolve({ projectId: project.id }),
    });
    const uploadJson = (await uploaded.json()) as {
      asset: { id: string; contentUrl: string };
    };
    const listed = await listAssets(
      new Request(`http://localhost:3000/api/projects/${project.id}/assets`, {
        headers: { host: "localhost:3000" },
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    const listedText = JSON.stringify(await listed.json());
    const content = await getAssetContent(
      new Request(`http://localhost:3000${uploadJson.asset.contentUrl}`, {
        headers: { host: "localhost:3000" },
      }),
      { params: Promise.resolve({ assetId: uploadJson.asset.id }) },
    );

    expect(uploaded.status).toBe(201);
    expect(listed.status).toBe(200);
    expect(listedText).not.toContain("relativePath");
    expect(listedText).not.toContain(dataRoot);
    expect(content.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(PNG_FIXTURE);
  });

  it("rejects external origins and forged PNG signatures without creating assets", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "morphflow-asset-reject-"));
    directories.push(dataRoot);
    process.env.MORPHFLOW_DATA_DIR = dataRoot;
    const database = openMorphFlowDatabase({
      filename: join(dataRoot, "morphflow.sqlite"),
    });
    const project = new ProjectRepository(database).createProject({ name: "拒绝伪造" });
    database.close();

    const external = await uploadAsset(
      new Request(`http://localhost:3000/api/projects/${project.id}/assets`, {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "https://attacker.example",
        },
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    const form = new FormData();
    form.set("kind", "source_image");
    form.set(
      "file",
      new File([Uint8Array.from([1, 2, 3, 4])], "forged.png", {
        type: "image/png",
      }),
    );
    const encodedRequest = new Request(
      `http://localhost:3000/api/projects/${project.id}/assets`,
      { method: "POST", body: form },
    );
    const encodedBody = await encodedRequest.arrayBuffer();
    const forged = await uploadAsset(
      new Request(encodedRequest.url, {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
          "content-type": encodedRequest.headers.get("content-type") ?? "",
          "content-length": String(encodedBody.byteLength),
        },
        body: encodedBody,
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );
    const listed = await listAssets(
      new Request(`http://localhost:3000/api/projects/${project.id}/assets`, {
        headers: { host: "localhost:3000" },
      }),
      { params: Promise.resolve({ projectId: project.id }) },
    );

    expect(external.status).toBe(403);
    expect(forged.status).toBe(400);
    expect(await listed.json()).toEqual({ assets: [] });
  });
});
