import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openMorphFlowDatabase } from "../db/connection";
import { ProjectRepository } from "../projects/repository";
import {
  resolveAssetFile,
  storeLocalAsset,
  validateUploadMetadata,
} from "./local-store";

const directories: string[] = [];
const PNG_FIXTURE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52,
]);

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local media store", () => {
  it("rejects unsafe names and MIME/extension mismatches", () => {
    expect(() =>
      validateUploadMetadata({
        filename: "../frame.png",
        declaredMime: "image/png",
        kind: "source_image",
      }),
    ).toThrow("Unsafe upload filename");
    expect(() =>
      validateUploadMetadata({
        filename: "frame.jpg",
        declaredMime: "image/png",
        kind: "source_image",
      }),
    ).toThrow("does not match");
  });

  it("streams a validated asset into a server-generated contained path", async () => {
    const directory = mkdtempSync(join(tmpdir(), "morphflow-media-"));
    directories.push(directory);
    const database = openMorphFlowDatabase({
      filename: join(directory, "morphflow.sqlite"),
    });
    const projects = new ProjectRepository(database, {
      createId: () => "project_01",
      now: () => 1_786_262_400_000,
    });
    projects.createProject({ name: "素材测试" });

    const asset = await storeLocalAsset(
      {
        database,
        dataRoot: directory,
        projectId: "project_01",
        kind: "source_image",
        originalFilename: "first-frame.png",
        declaredMime: "image/png",
        stream: (async function* () {
          yield PNG_FIXTURE.subarray(0, 5);
          yield PNG_FIXTURE.subarray(5);
        })(),
      },
      {
        createId: () => "asset_01",
        now: () => 1_786_262_400_000,
      },
    );

    expect(asset.relativePath).toBe(
      "media/project_01/asset_01/asset_01.png",
    );
    expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
    const absolute = resolveAssetFile(directory, asset);
    expect(readFileSync(absolute)).toEqual(Buffer.from(PNG_FIXTURE));
    expect(() =>
      resolveAssetFile(directory, {
        ...asset,
        relativePath: "media/project_01/asset_01/../../escape.png",
      }),
    ).toThrow("Invalid stored asset path");
    expect(projects.listAssets("project_01")).toEqual([asset]);
    database.close();
  });

  it("removes partial data when a stream exceeds the configured limit", async () => {
    const directory = mkdtempSync(join(tmpdir(), "morphflow-media-limit-"));
    directories.push(directory);
    const database = openMorphFlowDatabase({
      filename: join(directory, "morphflow.sqlite"),
    });
    const projects = new ProjectRepository(database, {
      createId: () => "project_01",
    });
    projects.createProject({ name: "大小限制" });

    await expect(
      storeLocalAsset(
        {
          database,
          dataRoot: directory,
          projectId: "project_01",
          kind: "source_image",
          originalFilename: "frame.png",
          declaredMime: "image/png",
          stream: (async function* () {
            yield PNG_FIXTURE;
          })(),
          maxBytes: 8,
        },
        { createId: () => "asset_01" },
      ),
    ).rejects.toThrow("Upload exceeds");
    expect(projects.listAssets("project_01")).toEqual([]);
    database.close();
  });
});
