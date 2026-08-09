import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { openLocalDatabase } from "./local-database";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("openLocalDatabase", () => {
  it("rejects a configured symlink that resolves into the source repository", () => {
    const parent = mkdtempSync(join(tmpdir(), "morphflow-db-root-"));
    const source = join(parent, "source");
    const link = join(parent, "configured-link");
    directories.push(parent);
    mkdirSync(source);
    symlinkSync(source, link);

    expect(() =>
      openLocalDatabase({
        environment: { MORPHFLOW_DATA_DIR: link },
        sourceDirectory: source,
      }),
    ).toThrow();
  });
});
