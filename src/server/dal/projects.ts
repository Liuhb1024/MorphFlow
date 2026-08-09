import type { LocalDatabaseOptions } from "../runtime/local-database";
import { openLocalDatabase } from "../runtime/local-database";
import {
  ProjectRepository,
  type Asset,
  type Project,
  type Shot,
} from "../projects/repository";

export type ProjectSummaryDto = Readonly<{
  id: string;
  name: string;
  description: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}>;

export type ShotDto = Readonly<{
  id: string;
  projectId: string;
  position: number;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}>;

export type AssetDto = Readonly<{
  id: string;
  projectId: string;
  shotId: string | null;
  kind: Asset["kind"];
  source: Asset["source"];
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
  contentUrl: string;
}>;

export type ProjectWorkspaceDto = Readonly<{
  project: ProjectSummaryDto;
  shots: readonly ShotDto[];
  assets: readonly AssetDto[];
}>;

export function projectDto(project: Project): ProjectSummaryDto {
  return { ...project };
}

function shotDto(shot: Shot): ShotDto {
  return { ...shot };
}

export function assetDto(asset: Asset): AssetDto {
  return {
    id: asset.id,
    projectId: asset.projectId,
    shotId: asset.shotId,
    kind: asset.kind,
    source: asset.source,
    displayName: asset.displayName,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    sha256: asset.sha256,
    width: asset.width,
    height: asset.height,
    durationMs: asset.durationMs,
    fps: asset.fps,
    parentAssetId: asset.parentAssetId,
    createdAt: asset.createdAt,
    contentUrl: `/api/assets/${encodeURIComponent(asset.id)}/content`,
  };
}

export function listProjectSummaries(
  options: LocalDatabaseOptions = {},
): ProjectSummaryDto[] {
  const handle = openLocalDatabase(options);
  try {
    return new ProjectRepository(handle.database).listProjects().map(projectDto);
  } finally {
    handle.close();
  }
}

export function getProjectWorkspace(
  projectId: string,
  options: LocalDatabaseOptions = {},
): ProjectWorkspaceDto {
  const handle = openLocalDatabase(options);
  try {
    const repository = new ProjectRepository(handle.database);
    return {
      project: projectDto(repository.getProject(projectId)),
      shots: repository.listShots(projectId).map(shotDto),
      assets: repository.listAssets(projectId).map(assetDto),
    };
  } finally {
    handle.close();
  }
}
