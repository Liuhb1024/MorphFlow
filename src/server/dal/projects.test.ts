import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getProjectWorkspace,
  listProjectSummaries,
} from "./projects";
import { ProjectRepository } from "../projects/repository";
import { openLocalDatabase } from "../runtime/local-database";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("project DAL", () => {
  it("returns safe DTOs without database or filesystem paths", () => {
    const dataRoot = mkdtempSync(join(tmpdir(), "morphflow-dal-"));
    directories.push(dataRoot);
    const options = {
      environment: { MORPHFLOW_DATA_DIR: dataRoot },
      sourceDirectory: "/workspace/MorphFlow",
    };

    const handle = openLocalDatabase(options);
    const first = new ProjectRepository(handle.database).createProject({
      name: "真实项目",
    });
    handle.close();
    const projects = listProjectSummaries(options);
    const workspace = getProjectWorkspace(first.id, options);
    const serialized = JSON.stringify({ projects, workspace });

    expect(projects).toHaveLength(1);
    expect(workspace.assets).toEqual([]);
    expect(serialized).not.toContain(dataRoot);
    expect(serialized).not.toContain("relativePath");
    expect(serialized).not.toContain("morphflow.sqlite");
  });
});
