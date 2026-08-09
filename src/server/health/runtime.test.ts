import { describe, expect, it, vi } from "vitest";

import { collectLocalRuntimeHealth, type CommandProbe } from "./runtime";

describe("collectLocalRuntimeHealth", () => {
  it("reports local tools without invoking a shell or exposing command output", async () => {
    const probe = vi.fn<CommandProbe>(async (executable, args) => ({
      ok: true,
      firstLine: `${executable} ${args.join(" ")} fixture-version`,
    }));

    const health = await collectLocalRuntimeHealth({
      nodeVersion: "v24.19.0",
      probe,
    });

    expect(probe).toHaveBeenNthCalledWith(1, "ffmpeg", ["-version"]);
    expect(probe).toHaveBeenNthCalledWith(2, "ffprobe", ["-version"]);
    expect(health).toEqual({
      node: { ok: true, version: "v24.19.0" },
      ffmpeg: { ok: true, version: "ffmpeg -version fixture-version" },
      ffprobe: { ok: true, version: "ffprobe -version fixture-version" },
      database: { ok: false, state: "unconfigured" },
      worker: { ok: false, state: "offline" },
      credential: { configured: false },
    });
  });

  it("reports an injected database readiness probe", async () => {
    const health = await collectLocalRuntimeHealth({
      nodeVersion: "v24.19.0",
      probe: async () => ({ ok: false }),
      databaseProbe: async () => ({ ok: true, state: "initializable" }),
    });

    expect(health.database).toEqual({ ok: true, state: "initializable" });
  });

  it("fails closed when a local binary cannot be probed", async () => {
    const probe: CommandProbe = async () => ({ ok: false });

    const health = await collectLocalRuntimeHealth({
      nodeVersion: "v24.19.0",
      probe,
    });

    expect(health.ffmpeg).toEqual({ ok: false });
    expect(health.ffprobe).toEqual({ ok: false });
  });
});
