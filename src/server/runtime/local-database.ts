import type Database from "better-sqlite3";

import {
  initializeConfiguredDataPaths,
  resolveConfiguredDataPaths,
  type ConfiguredDataPaths,
  type DataPathEnvironment,
} from "../config/data-paths";
import { openMorphFlowDatabase } from "../db/connection";

export type LocalDatabaseOptions = Readonly<{
  environment?: DataPathEnvironment;
  sourceDirectory?: string;
}>;

export type LocalDatabaseHandle = Readonly<{
  database: Database.Database;
  paths: ConfiguredDataPaths;
  close: () => void;
}>;

export function openLocalDatabase(
  options: LocalDatabaseOptions = {},
): LocalDatabaseHandle {
  const sourceDirectory = options.sourceDirectory ?? process.cwd();
  const paths = initializeConfiguredDataPaths(
    resolveConfiguredDataPaths(options.environment ?? process.env, sourceDirectory),
    sourceDirectory,
  );
  const database = openMorphFlowDatabase({
    filename: paths.database,
    createParentDirectory: true,
  });
  return {
    database,
    paths,
    close: () => database.close(),
  };
}
