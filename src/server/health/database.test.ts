import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { probeConfiguredDatabase } from "./database";
import { openLocalDatabase } from "../runtime/local-database";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("probeConfiguredDatabase", () => {
  it("does not create an unconfigured or merely initializable database", async () => {
    const ancestor = mkdtempSync(join(tmpdir(), "morphflow-health-"));
    directories.push(ancestor);
    const dataRoot = join(ancestor, "not-created-yet");

    await expect(
      probeConfiguredDatabase({
        environment: { MORPHFLOW_DATA_DIR: dataRoot },
        sourceDirectory: "/workspace/MorphFlow",
      }),
    ).resolves.toEqual({ ok: true, state: "initializable" });

    expect(dirname(dataRoot)).toBe(ancestor);
    await expect(
      probeConfiguredDatabase({
        environment: {},
        sourceDirectory: "/workspace/MorphFlow",
      }),
    ).resolves.toEqual({ ok: false, state: "unconfigured" });
  });

  it("distinguishes a readable MorphFlow database from a corrupt file", async () => {
    const readyRoot = mkdtempSync(join(tmpdir(), "morphflow-health-ready-"));
    const corruptRoot = mkdtempSync(join(tmpdir(), "morphflow-health-corrupt-"));
    directories.push(readyRoot, corruptRoot);
    const sourceDirectory = "/workspace/MorphFlow";
    const handle = openLocalDatabase({
      environment: { MORPHFLOW_DATA_DIR: readyRoot },
      sourceDirectory,
    });
    handle.close();
    writeFileSync(join(corruptRoot, "morphflow.sqlite"), "not a sqlite database");

    await expect(
      probeConfiguredDatabase({
        environment: { MORPHFLOW_DATA_DIR: readyRoot },
        sourceDirectory,
      }),
    ).resolves.toEqual({ ok: true, state: "ready" });
    await expect(
      probeConfiguredDatabase({
        environment: { MORPHFLOW_DATA_DIR: corruptRoot },
        sourceDirectory,
      }),
    ).resolves.toEqual({ ok: false, state: "unavailable" });
  });
});
