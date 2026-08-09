import { describe, expect, it } from "vitest";

import { resolveConfiguredDataPaths } from "./data-paths";

describe("resolveConfiguredDataPaths", () => {
  it("requires an explicit absolute directory", () => {
    expect(() => resolveConfiguredDataPaths({}, "/workspace/MorphFlow")).toThrow(
      "MORPHFLOW_DATA_DIR is not configured",
    );
    expect(() =>
      resolveConfiguredDataPaths(
        { MORPHFLOW_DATA_DIR: "relative-data" },
        "/workspace/MorphFlow",
      ),
    ).toThrow("must be absolute");
  });

  it("rejects the repository and broad parent directories", () => {
    expect(() =>
      resolveConfiguredDataPaths(
        { MORPHFLOW_DATA_DIR: "/workspace/MorphFlow/data" },
        "/workspace/MorphFlow",
      ),
    ).toThrow("must be outside the source repository");
    expect(() =>
      resolveConfiguredDataPaths(
        { MORPHFLOW_DATA_DIR: "/workspace" },
        "/workspace/MorphFlow",
      ),
    ).toThrow("must not contain the source repository");
  });

  it("returns controlled database, media, and temp paths", () => {
    expect(
      resolveConfiguredDataPaths(
        { MORPHFLOW_DATA_DIR: "/private/tmp/morphflow-data" },
        "/workspace/MorphFlow",
      ),
    ).toEqual({
      root: "/private/tmp/morphflow-data",
      database: "/private/tmp/morphflow-data/morphflow.sqlite",
      media: "/private/tmp/morphflow-data/media",
      temp: "/private/tmp/morphflow-data/temp",
    });
  });
});
