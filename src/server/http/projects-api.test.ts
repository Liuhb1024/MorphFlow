import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GET, POST } from "../../app/api/projects/route";
import {
  DELETE as DELETE_PROJECT,
  PATCH as PATCH_PROJECT,
} from "../../app/api/projects/[projectId]/route";

const directories: string[] = [];
const originalDataDirectory = process.env.MORPHFLOW_DATA_DIR;

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

describe("projects API", () => {
  it("creates and lists a project without exposing local paths", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "morphflow-project-api-"));
    directories.push(dataRoot);
    process.env.MORPHFLOW_DATA_DIR = dataRoot;
    const mutation = new Request("http://localhost:3000/api/projects", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "真实项目" }),
    });

    const created = await POST(mutation);
    const listed = await GET(
      new Request("http://localhost:3000/api/projects", {
        headers: { host: "localhost:3000" },
      }),
    );
    const serialized = JSON.stringify(await listed.json());

    expect(created.status).toBe(201);
    expect(listed.status).toBe(200);
    expect(serialized).toContain("真实项目");
    expect(serialized).not.toContain(dataRoot);
    expect(serialized).not.toContain("morphflow.sqlite");
  });

  it("renames and permanently deletes a project with its media directory", async () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "morphflow-project-mutations-"));
    directories.push(dataRoot);
    process.env.MORPHFLOW_DATA_DIR = dataRoot;
    const originHeaders = {
      host: "localhost:3000",
      origin: "http://localhost:3000",
      "content-type": "application/json",
    };
    const created = await POST(new Request("http://localhost:3000/api/projects", {
      method: "POST",
      headers: originHeaders,
      body: JSON.stringify({ name: "可管理项目" }),
    }));
    const createdBody = await created.json() as { project: { id: string } };
    const projectId = createdBody.project.id;
    const context = { params: Promise.resolve({ projectId }) };
    const mediaDirectory = join(dataRoot, "media", projectId);
    mkdirSync(mediaDirectory, { recursive: true });
    writeFileSync(join(mediaDirectory, "marker.txt"), "local-only");

    const renamed = await PATCH_PROJECT(new Request(
      `http://localhost:3000/api/projects/${projectId}`,
      {
        method: "PATCH",
        headers: originHeaders,
        body: JSON.stringify({ name: "已经重命名" }),
      },
    ), context);
    expect(renamed.status).toBe(200);
    expect(JSON.stringify(await renamed.json())).toContain("已经重命名");

    const deleted = await DELETE_PROJECT(new Request(
      `http://localhost:3000/api/projects/${projectId}`,
      { method: "DELETE", headers: { host: "localhost:3000", origin: "http://localhost:3000" } },
    ), context);
    expect(deleted.status).toBe(200);
    expect(existsSync(mediaDirectory)).toBe(false);

    const listed = await GET(new Request("http://localhost:3000/api/projects", {
      headers: { host: "localhost:3000" },
    }));
    expect(JSON.stringify(await listed.json())).not.toContain(projectId);
  });
});
