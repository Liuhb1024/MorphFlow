import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openMorphFlowDatabase } from "./connection";

const temporaryDirectories: string[] = [];

function createTemporaryDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("openMorphFlowDatabase", () => {
  it("configures WAL, foreign keys, and a finite busy timeout in a temp db", () => {
    const directory = createTemporaryDirectory("morphflow-db-test-");
    const filename = join(directory, "test.sqlite");
    const database = openMorphFlowDatabase({ filename });

    expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(database.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(database.pragma("busy_timeout", { simple: true })).toBe(5_000);

    database.close();
  });

  it("installs job constraints and immutable job events", () => {
    const directory = createTemporaryDirectory("morphflow-schema-test-");
    const filename = join(directory, "test.sqlite");
    const database = openMorphFlowDatabase({ filename });

    database
      .prepare(
        `INSERT INTO jobs (id, kind, status, submission_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run("job_01", "video_generation", "queued", "submission_01", 1, 1);
    database
      .prepare(
        `INSERT INTO job_events (id, job_id, from_status, to_status, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("event_01", "job_01", null, "queued", 1);

    expect(() =>
      database
        .prepare("UPDATE job_events SET to_status = ? WHERE id = ?")
        .run("failed", "event_01"),
    ).toThrow("job_events are append-only");
    expect(() =>
      database.prepare("UPDATE jobs SET status = ? WHERE id = ?").run(
        "not_a_real_status",
        "job_01",
      ),
    ).toThrow();

    database.close();
    expect(readFileSync(filename).byteLength).toBeGreaterThan(0);
  });
});
