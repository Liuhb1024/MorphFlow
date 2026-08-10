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

  it("renames a project and advances its revision", () => {
    const database = openMorphFlowDatabase({ filename: ":memory:" });
    const ticks = [1_000, 2_000];
    const repository = new ProjectRepository(database, {
      createId: () => "project_editable",
      now: () => ticks.shift() ?? 2_000,
    });
    const project = repository.createProject({ name: "旧名称" });

    const updated = repository.updateProject(project.id, { name: "新名称" });

    expect(updated).toMatchObject({
      id: project.id,
      name: "新名称",
      revision: 2,
      updatedAt: 2_000,
    });
    database.close();
  });

  it("deletes a project and its dependent records", () => {
    const database = openMorphFlowDatabase({ filename: ":memory:" });
    const ids = ["project_delete", "shot_delete"];
    const repository = new ProjectRepository(database, {
      createId: () => ids.shift() ?? "unexpected",
      now: () => 1_000,
    });
    const project = repository.createProject({ name: "待删除项目" });
    const shot = repository.createShot({ projectId: project.id, name: "镜头" });
    repository.insertAsset({
      id: "asset_delete",
      projectId: project.id,
      shotId: shot.id,
      kind: "source_image",
      relativePath: "media/project_delete/asset_delete/asset_delete.png",
      displayName: "source.png",
      mimeType: "image/png",
      byteSize: 8,
      sha256: "a".repeat(64),
    });

    repository.deleteProject(project.id);

    expect(repository.listProjects()).toEqual([]);
    expect(() => repository.getProject(project.id)).toThrow("Project not found");
    expect(() => repository.getShot(shot.id)).toThrow("Shot not found");
    expect(() => repository.getAsset("asset_delete")).toThrow("Asset not found");
    database.close();
  });

});
