import { constants } from "node:fs";
import { access, lstat } from "node:fs/promises";
import { dirname } from "node:path";

import Database from "better-sqlite3";

import {
  resolveConfiguredDataPaths,
  type DataPathEnvironment,
} from "../config/data-paths";
import type { DatabaseHealth } from "./runtime";

async function nearestExistingDirectory(path: string): Promise<string | null> {
  let candidate = path;
  while (true) {
    try {
      const info = await lstat(candidate);
      if (info.isDirectory() && !info.isSymbolicLink()) return candidate;
      return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return null;
    }
    const parent = dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
}

/** Read-only readiness probe. It never creates the data directory or database. */
export async function probeConfiguredDatabase(options: {
  environment?: DataPathEnvironment;
  sourceDirectory?: string;
} = {}): Promise<DatabaseHealth> {
  let paths;
  try {
    paths = resolveConfiguredDataPaths(
      options.environment ?? process.env,
      options.sourceDirectory ?? process.cwd(),
    );
  } catch (error) {
    return error instanceof Error && error.message.includes("not configured")
      ? { ok: false, state: "unconfigured" }
      : { ok: false, state: "unavailable" };
  }

  try {
    const rootInfo = await lstat(paths.root).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (rootInfo?.isSymbolicLink() || (rootInfo && !rootInfo.isDirectory())) {
      return { ok: false, state: "unavailable" };
    }
    if (rootInfo) {
      await access(paths.root, constants.R_OK | constants.W_OK);
    } else {
      const ancestor = await nearestExistingDirectory(dirname(paths.root));
      if (!ancestor) return { ok: false, state: "unavailable" };
      await access(ancestor, constants.W_OK);
    }

    const databaseInfo = await lstat(paths.database).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return null;
        throw error;
      },
    );
    if (!databaseInfo) return { ok: true, state: "initializable" };
    if (!databaseInfo.isFile() || databaseInfo.isSymbolicLink()) {
      return { ok: false, state: "unavailable" };
    }
    await access(paths.database, constants.R_OK | constants.W_OK);
    const database = new Database(paths.database, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      const integrity = database.pragma("quick_check", { simple: true });
      if (integrity !== "ok") return { ok: false, state: "unavailable" };
      const schema = database
        .prepare(
          "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'schema_metadata'",
        )
        .get() as { present: 1 } | undefined;
      return schema
        ? { ok: true, state: "ready" }
        : { ok: true, state: "initializable" };
    } finally {
      database.close();
    }
  } catch {
    return { ok: false, state: "unavailable" };
  }
}
