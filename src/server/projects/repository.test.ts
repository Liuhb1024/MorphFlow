import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openMorphFlowDatabase } from "../db/connection";
import { ProjectRepository } from "./repository";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("ProjectRepository", () => {
  it("creates and queries real projects and ordered shots", () => {
    const directory = mkdtempSync(join(tmpdir(), "morphflow-projects-"));
    directories.push(directory);
    const database = openMorphFlowDatabase({
      filename: join(directory, "test.sqlite"),
    });
    const ids = ["project_01", "shot_01", "shot_02"];
    const repository = new ProjectRepository(database, {
      createId: () => ids.shift() ?? "unexpected",
      now: () => 1_786_262_400_000,
    });

    const project = repository.createProject({
      name: "夜色穿越",
      description: "手拍视频接 AI 转场",
    });
    repository.createShot({ projectId: project.id, name: "现实尾帧" });
    repository.createShot({ projectId: project.id, name: "AI 转场" });

    expect(repository.listProjects()).toEqual([project]);
    expect(repository.listShots(project.id).map((shot) => shot.position)).toEqual([
      0, 1,
    ]);
    expect(repository.listShots(project.id).map((shot) => shot.name)).toEqual([
      "现实尾帧",
      "AI 转场",
    ]);
    database.close();
  });

  it("rejects invalid identifiers and missing parents", () => {
    const database = openMorphFlowDatabase({ filename: ":memory:" });
    const repository = new ProjectRepository(database);

    expect(() => repository.getProject("../outside")).toThrow("Invalid project id");
    expect(() =>
      repository.createShot({ projectId: "project_missing", name: "镜头" }),
    ).toThrow("Project not found");
    database.close();
  });

});
