import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

export const VIDEO_TASK_STATUSES = [
  "submitting", "submitted", "running", "succeeded", "failed", "unknown",
] as const;
export type VideoTaskStatus = (typeof VIDEO_TASK_STATUSES)[number];

export type VideoTask = Readonly<{
  id: string;
  projectId: string;
  capabilityId: string;
  modelId: string;
  status: VideoTaskStatus;
  providerTaskId: string | null;
  request: Readonly<Record<string, unknown>>;
  resultAssetId: string | null;
  errorCode: string | null;
  estimatedCostCny: number | null;
  createdAt: number;
  updatedAt: number;
}>;

type Row = {
  id: string; project_id: string; capability_id: string; model_id: string;
  status: VideoTaskStatus; provider_task_id: string | null; request_json: string;
  result_asset_id: string | null; error_code: string | null;
  estimated_cost_cny: number | null; created_at: number; updated_at: number;
};

function map(row: Row): VideoTask {
  return {
    id: row.id, projectId: row.project_id, capabilityId: row.capability_id,
    modelId: row.model_id, status: row.status, providerTaskId: row.provider_task_id,
    request: JSON.parse(row.request_json) as Record<string, unknown>,
    resultAssetId: row.result_asset_id, errorCode: row.error_code,
    estimatedCostCny: row.estimated_cost_cny, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export class VideoTaskRepository {
  constructor(private readonly database: Database.Database, private readonly now = Date.now) {}

  create(input: { projectId: string; capabilityId: string; modelId: string; request: Readonly<Record<string, unknown>>; estimatedCostCny: number | null }): VideoTask {
    const id = `video_task_${randomUUID()}`;
    const now = this.now();
    this.database.prepare(`INSERT INTO generation_tasks
      (id, project_id, capability_id, model_id, status, request_json, estimated_cost_cny, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'submitting', ?, ?, ?, ?)`)
      .run(id, input.projectId, input.capabilityId, input.modelId, JSON.stringify(input.request), input.estimatedCostCny, now, now);
    return this.get(id);
  }

  get(id: string): VideoTask {
    if (!/^video_task_[A-Za-z0-9-]{1,80}$/.test(id)) throw new Error("Invalid video task id");
    const row = this.database.prepare("SELECT * FROM generation_tasks WHERE id = ?").get(id) as Row | undefined;
    if (!row) throw new Error("Video task not found");
    return map(row);
  }

  list(projectId: string): VideoTask[] {
    return (this.database.prepare("SELECT * FROM generation_tasks WHERE project_id = ? ORDER BY created_at DESC, id").all(projectId) as Row[]).map(map);
  }

  update(id: string, input: { status: VideoTaskStatus; providerTaskId?: string; resultAssetId?: string; errorCode?: string | null }): VideoTask {
    const current = this.get(id);
    const allowed: Record<VideoTaskStatus, readonly VideoTaskStatus[]> = {
      submitting: ["submitted", "unknown", "failed"],
      submitted: ["submitted", "running", "succeeded", "failed", "unknown"],
      running: ["running", "succeeded", "failed", "unknown"],
      unknown: ["submitted", "running", "succeeded", "failed", "unknown"],
      succeeded: [], failed: [],
    };
    if (!allowed[current.status].includes(input.status)) throw new Error("Invalid video task transition");
    const providerTaskId = input.providerTaskId ?? current.providerTaskId;
    if ((input.status === "submitted" || input.status === "running" || input.status === "succeeded") && !providerTaskId) {
      throw new Error("Provider task id required");
    }
    this.database.prepare(`UPDATE generation_tasks SET status = ?, provider_task_id = ?, result_asset_id = ?, error_code = ?, updated_at = ? WHERE id = ?`)
      .run(input.status, providerTaskId, input.resultAssetId ?? current.resultAssetId, input.errorCode === undefined ? current.errorCode : input.errorCode, this.now(), id);
    return this.get(id);
  }
}
