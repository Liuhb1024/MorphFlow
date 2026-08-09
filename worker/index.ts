import { checkWorkerHealth } from "./health";

/**
 * Safe placeholder entry: it performs no network I/O, opens no user database,
 * and cannot accept paid work until the persistent queue is wired explicitly.
 */
void checkWorkerHealth({
  now: () => new Date(),
  checkDatabase: async () => ({ ok: false, reason: "not_configured" }),
}).then((report) => {
  process.stdout.write(`${JSON.stringify(report)}\n`);
});
