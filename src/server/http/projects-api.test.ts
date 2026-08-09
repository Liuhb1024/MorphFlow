import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { GET, POST } from "../../app/api/projects/route";

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
});
