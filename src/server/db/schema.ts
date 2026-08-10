import { JOB_STATUSES } from "../jobs/state-machine";

const quotedJobStatuses = JOB_STATUSES.map((status) => `'${status}'`).join(", ");

export const MORPHFLOW_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
) STRICT;

INSERT INTO schema_metadata (key, value)
VALUES ('schema_version', '3')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS projects_updated_index
ON projects(updated_at DESC, id);

CREATE TABLE IF NOT EXISTS shots (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_id, position)
) STRICT;

CREATE INDEX IF NOT EXISTS shots_project_position_index
ON shots(project_id, position);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  shot_id TEXT REFERENCES shots(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'source_video', 'source_image', 'reference_image', 'first_frame',
    'last_frame', 'hand_drawn_image', 'generated_image', 'generated_video'
  )),
  source TEXT NOT NULL DEFAULT 'local_upload' CHECK (source IN (
    'local_upload', 'frame_extraction', 'image_generation', 'video_generation'
  )),
  relative_path TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 120),
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  fps REAL CHECK (fps IS NULL OR fps > 0),
  parent_asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS assets_project_created_index
ON assets(project_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS assets_shot_created_index
ON assets(shot_id, created_at, id);

CREATE TABLE IF NOT EXISTS generation_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  capability_id TEXT NOT NULL CHECK (length(capability_id) BETWEEN 1 AND 160),
  model_id TEXT NOT NULL CHECK (length(model_id) BETWEEN 1 AND 128),
  status TEXT NOT NULL CHECK (status IN (
    'submitting', 'submitted', 'running', 'succeeded', 'failed', 'unknown'
  )),
  provider_task_id TEXT,
  request_json TEXT NOT NULL CHECK (length(request_json) <= 131072),
  result_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 160),
  estimated_cost_cny REAL CHECK (estimated_cost_cny IS NULL OR estimated_cost_cny >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS generation_tasks_provider_id_unique
ON generation_tasks(provider_task_id)
WHERE provider_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS generation_tasks_project_created_index
ON generation_tasks(project_id, created_at DESC, id);

CREATE TABLE IF NOT EXISTS credential_settings (
  provider TEXT PRIMARY KEY NOT NULL,
  keychain_reference TEXT NOT NULL,
  configured INTEGER NOT NULL DEFAULT 0 CHECK (configured IN (0, 1)),
  last_four TEXT CHECK (last_four IS NULL OR length(last_four) <= 4),
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (length(kind) > 0),
  status TEXT NOT NULL CHECK (status IN (${quotedJobStatuses})),
  submission_key TEXT NOT NULL UNIQUE,
  provider TEXT,
  provider_task_id TEXT,
  provider_status TEXT,
  error_category TEXT,
  lease_owner TEXT,
  leased_at INTEGER,
  lease_expires_at INTEGER,
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (
    (lease_owner IS NULL AND leased_at IS NULL AND lease_expires_at IS NULL)
    OR
    (lease_owner IS NOT NULL AND leased_at IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_provider_task_id_unique
ON jobs(provider, provider_task_id)
WHERE provider IS NOT NULL AND provider_task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS jobs_status_lease_index
ON jobs(status, lease_expires_at);

CREATE TABLE IF NOT EXISTS job_events (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN (${quotedJobStatuses})),
  to_status TEXT NOT NULL CHECK (to_status IN (${quotedJobStatuses})),
  event_type TEXT NOT NULL DEFAULT 'state_transition',
  redacted_summary TEXT,
  created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS job_events_job_created_index
ON job_events(job_id, created_at);

CREATE TRIGGER IF NOT EXISTS job_events_prevent_update
BEFORE UPDATE ON job_events
BEGIN
  SELECT RAISE(ABORT, 'job_events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS job_events_prevent_delete
BEFORE DELETE ON job_events
BEGIN
  SELECT RAISE(ABORT, 'job_events are append-only');
END;
`;
