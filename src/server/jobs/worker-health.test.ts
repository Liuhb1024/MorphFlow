import { describe, expect, it } from "vitest";

import { checkWorkerHealth } from "../../../worker/health";

describe("checkWorkerHealth", () => {
  it("reports readiness without starting a paid task loop", async () => {
    const report = await checkWorkerHealth({
      now: () => new Date("2026-08-09T00:00:00.000Z"),
      checkDatabase: async () => ({ ok: true }),
    });

    expect(report).toEqual({
      status: "ready",
      checkedAt: "2026-08-09T00:00:00.000Z",
      database: { ok: true },
      acceptsPaidJobs: false,
    });
  });

  it("degrades safely when the queue database is unavailable", async () => {
    const report = await checkWorkerHealth({
      now: () => new Date("2026-08-09T00:00:00.000Z"),
      checkDatabase: async () => ({ ok: false, reason: "unavailable" }),
    });

    expect(report.status).toBe("degraded");
    expect(report.acceptsPaidJobs).toBe(false);
  });
});
