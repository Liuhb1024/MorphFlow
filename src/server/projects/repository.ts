import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

export const ASSET_KINDS = [
  "source_video",
  "source_image",
  "reference_image",
  "first_frame",
  "last_frame",
  "hand_drawn_image",
  "generated_image",
  "generated_video",
] as const;

export type AssetKind = (typeof ASSET_KINDS)[number];
export type AssetSource =
  | "local_upload"
  | "frame_extraction"
  | "image_generation"
  | "video_generation";

export type Project = Readonly<{
  id: string;
  name: string;
  description: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}>;

export type Shot = Readonly<{
  id: string;
  projectId: string;
  position: number;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}>;

export type Asset = Readonly<{
  id: string;
  projectId: string;
  shotId: string | null;
  kind: AssetKind;
  source: AssetSource;
  relativePath: string;
  displayName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  fps: number | null;
  parentAssetId: string | null;
  createdAt: number;
}>;

type RepositoryDependencies = Readonly<{
  createId?: (prefix: "project" | "shot") => string;
  now?: () => number;
}>;

type ProjectRow = {
  id: string;
  name: string;
  description: string;
  revision: number;
  created_at: number;
  updated_at: number;
};

type ShotRow = {
  id: string;
  project_id: string;
  position: number;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
};

type AssetRow = {
  id: string;
  project_id: string;
  shot_id: string | null;
  kind: AssetKind;
  source: AssetSource;
  relative_path: string;
  display_name: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  fps: number | null;
  parent_asset_id: string | null;
  created_at: number;
};

export type NewAsset = Readonly<{
  id: string;
  projectId: string;
  shotId?: string | null;
  kind: AssetKind;
  source?: AssetSource;
  relativePath: string;
  displayName: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  fps?: number | null;
  parentAssetId?: string | null;
  createdAt?: number;
}>;

export function assertResourceId(value: string, label: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)) {
    throw new Error(`Invalid ${label} id`);
  }
}

function cleanText(value: string | undefined, label: string, max: number): string {
  const cleaned = (value ?? "").normalize("NFC").trim();
  if ((label === "name" && cleaned.length === 0) || cleaned.length > max) {
    throw new Error(`Invalid ${label}`);
  }
  return cleaned;
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapShot(row: ShotRow): Shot {
  return {
    id: row.id,
    projectId: row.project_id,
    position: row.position,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    projectId: row.project_id,
    shotId: row.shot_id,
    kind: row.kind,
    source: row.source,
    relativePath: row.relative_path,
    displayName: row.display_name,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    sha256: row.sha256,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    fps: row.fps,
    parentAssetId: row.parent_asset_id,
    createdAt: row.created_at,
  };
}

export class ProjectRepository {
  private readonly createId: (prefix: "project" | "shot") => string;
  private readonly now: () => number;

  constructor(
    private readonly database: Database.Database,
    dependencies: RepositoryDependencies = {},
  ) {
    this.createId =
      dependencies.createId ?? ((prefix) => `${prefix}_${randomUUID()}`);
    this.now = dependencies.now ?? Date.now;
  }

  createProject(input: { name: string; description?: string }): Project {
    const id = this.createId("project");
    assertResourceId(id, "project");
    const name = cleanText(input.name, "name", 120);
    const description = cleanText(input.description, "description", 2_000);
    const now = this.now();
    this.database
      .prepare(
        `INSERT INTO projects
          (id, name, description, revision, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
      )
      .run(id, name, description, now, now);
    return this.getProject(id);
  }

  getProject(id: string): Project {
    assertResourceId(id, "project");
    const row = this.database
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow | undefined;
    if (!row) {
      throw new Error("Project not found");
    }
    return mapProject(row);
  }

  listProjects(): Project[] {
    return (
      this.database
        .prepare("SELECT * FROM projects ORDER BY updated_at DESC, id")
        .all() as ProjectRow[]
    ).map(mapProject);
  }

  createShot(input: {
    projectId: string;
    name: string;
    description?: string;
  }): Shot {
    this.getProject(input.projectId);
    const id = this.createId("shot");
    assertResourceId(id, "shot");
    const name = cleanText(input.name, "name", 120);
    const description = cleanText(input.description, "description", 2_000);
    const now = this.now();
    const position = (
      this.database
        .prepare(
          "SELECT COALESCE(MAX(position) + 1, 0) AS position FROM shots WHERE project_id = ?",
        )
        .get(input.projectId) as { position: number }
    ).position;
    this.database
      .prepare(
        `INSERT INTO shots
          (id, project_id, position, name, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.projectId, position, name, description, now, now);
    return this.getShot(id);
  }

  getShot(id: string): Shot {
    assertResourceId(id, "shot");
    const row = this.database
      .prepare("SELECT * FROM shots WHERE id = ?")
      .get(id) as ShotRow | undefined;
    if (!row) {
      throw new Error("Shot not found");
    }
    return mapShot(row);
  }

  listShots(projectId: string): Shot[] {
    this.getProject(projectId);
    return (
      this.database
        .prepare("SELECT * FROM shots WHERE project_id = ? ORDER BY position, id")
        .all(projectId) as ShotRow[]
    ).map(mapShot);
  }

  insertAsset(input: NewAsset): Asset {
    assertResourceId(input.id, "asset");
    this.getProject(input.projectId);
    if (input.shotId) {
      const shot = this.getShot(input.shotId);
      if (shot.projectId !== input.projectId) {
        throw new Error("Shot does not belong to project");
      }
    }
    const createdAt = input.createdAt ?? this.now();
    this.database
      .prepare(
        `INSERT INTO assets (
          id, project_id, shot_id, kind, source, relative_path, display_name,
          mime_type, byte_size, sha256, width, height, duration_ms, fps,
          parent_asset_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.projectId,
        input.shotId ?? null,
        input.kind,
        input.source ?? "local_upload",
        input.relativePath,
        cleanText(input.displayName, "display name", 120),
        input.mimeType,
        input.byteSize,
        input.sha256,
        input.width ?? null,
        input.height ?? null,
        input.durationMs ?? null,
        input.fps ?? null,
        input.parentAssetId ?? null,
        createdAt,
      );
    return this.getAsset(input.id);
  }

  getAsset(id: string): Asset {
    assertResourceId(id, "asset");
    const row = this.database
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(id) as AssetRow | undefined;
    if (!row) {
      throw new Error("Asset not found");
    }
    return mapAsset(row);
  }

  listAssets(projectId: string): Asset[] {
    this.getProject(projectId);
    return (
      this.database
        .prepare(
          "SELECT * FROM assets WHERE project_id = ? ORDER BY created_at, id",
        )
        .all(projectId) as AssetRow[]
    ).map(mapAsset);
  }
}
