import { mkdirSync } from "node:fs";
import { isAbsolute, dirname } from "node:path";

import Database from "better-sqlite3";

import { MORPHFLOW_SCHEMA_SQL } from "./schema";

export type OpenDatabaseOptions = Readonly<{
  /** Must be explicit so tests never fall back to a real user data directory. */
  filename: string;
  createParentDirectory?: boolean;
  initializeSchema?: boolean;
}>;

export type DatabaseConfiguration = Readonly<{
  journalMode: string;
  foreignKeys: boolean;
  busyTimeoutMs: number;
}>;

function validateFilename(filename: string): void {
  if (filename !== ":memory:" && !isAbsolute(filename)) {
    throw new Error("SQLite filename must be absolute or :memory:");
  }
}

export function readDatabaseConfiguration(
  database: Database.Database,
): DatabaseConfiguration {
  return {
    journalMode: String(database.pragma("journal_mode", { simple: true })),
    foreignKeys: database.pragma("foreign_keys", { simple: true }) === 1,
    busyTimeoutMs: Number(database.pragma("busy_timeout", { simple: true })),
  };
}

export function configureMorphFlowDatabase(
  database: Database.Database,
): DatabaseConfiguration {
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  if (database.name !== ":memory:") {
    database.pragma("journal_mode = WAL");
  }

  const configuration = readDatabaseConfiguration(database);
  const expectedJournalMode = database.name === ":memory:" ? "memory" : "wal";
  if (
    configuration.journalMode.toLowerCase() !== expectedJournalMode ||
    !configuration.foreignKeys ||
    configuration.busyTimeoutMs !== 5_000
  ) {
    throw new Error("SQLite safety configuration could not be verified");
  }
  return configuration;
}

export function openMorphFlowDatabase(
  options: OpenDatabaseOptions,
): Database.Database {
  validateFilename(options.filename);
  if (options.filename !== ":memory:" && options.createParentDirectory === true) {
    mkdirSync(dirname(options.filename), { recursive: true, mode: 0o700 });
  }

  const database = new Database(options.filename);
  try {
    configureMorphFlowDatabase(database);
    if (options.initializeSchema !== false) {
      database.transaction(() => database.exec(MORPHFLOW_SCHEMA_SQL)).immediate();
    }
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
