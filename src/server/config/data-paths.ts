import { existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export type DataPathEnvironment = Readonly<Record<string, string | undefined>>;

export type ConfiguredDataPaths = Readonly<{
  root: string;
  database: string;
  media: string;
  temp: string;
}>;

function isContained(parent: string, candidate: string): boolean {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent === "" ||
    (!pathFromParent.startsWith("..") && !isAbsolute(pathFromParent))
  );
}

/** Pure path resolution: this function never creates or reads a user path. */
export function resolveConfiguredDataPaths(
  environment: DataPathEnvironment = process.env,
  sourceDirectory: string = process.cwd(),
): ConfiguredDataPaths {
  const configured = environment.MORPHFLOW_DATA_DIR?.trim();
  if (!configured) {
    throw new Error("MORPHFLOW_DATA_DIR is not configured");
  }
  if (!isAbsolute(configured)) {
    throw new Error("MORPHFLOW_DATA_DIR must be absolute");
  }

  const root = resolve(configured);
  const source = resolve(sourceDirectory);
  if (root === "/") {
    throw new Error("MORPHFLOW_DATA_DIR is too broad");
  }
  if (isContained(source, root)) {
    throw new Error("MORPHFLOW_DATA_DIR must be outside the source repository");
  }
  if (isContained(root, source)) {
    throw new Error("MORPHFLOW_DATA_DIR must not contain the source repository");
  }

  return {
    root,
    database: join(root, "morphflow.sqlite"),
    media: join(root, "media"),
    temp: join(root, "temp"),
  };
}

/** Creates only the explicitly configured root, then verifies its real path. */
export function initializeConfiguredDataPaths(
  paths: ConfiguredDataPaths,
  sourceDirectory: string = process.cwd(),
): ConfiguredDataPaths {
  mkdirSync(paths.root, { recursive: true, mode: 0o700 });
  const rootInfo = lstatSync(paths.root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("MORPHFLOW_DATA_DIR must be a real directory");
  }
  const canonicalRoot = realpathSync(paths.root);
  const canonicalSource = existsSync(sourceDirectory)
    ? realpathSync(sourceDirectory)
    : resolve(sourceDirectory);
  if (isContained(canonicalSource, canonicalRoot)) {
    throw new Error("MORPHFLOW_DATA_DIR must be outside the source repository");
  }
  if (isContained(canonicalRoot, canonicalSource)) {
    throw new Error("MORPHFLOW_DATA_DIR must not contain the source repository");
  }

  const database = join(canonicalRoot, "morphflow.sqlite");
  if (existsSync(database)) {
    const databaseInfo = lstatSync(database);
    if (!databaseInfo.isFile() || databaseInfo.isSymbolicLink()) {
      throw new Error("MorphFlow database must be a regular file");
    }
  }
  return {
    root: canonicalRoot,
    database,
    media: join(canonicalRoot, "media"),
    temp: join(canonicalRoot, "temp"),
  };
}
