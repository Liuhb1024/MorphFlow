export type DatabaseHealth = Readonly<{
  ok: boolean;
  reason?: string;
}>;

export type WorkerHealthDependencies = Readonly<{
  now: () => Date;
  checkDatabase: () => Promise<DatabaseHealth>;
}>;

export type WorkerHealthReport = Readonly<{
  status: "ready" | "degraded";
  checkedAt: string;
  database: DatabaseHealth;
  /** Remains false until the persistent lease loop is explicitly enabled. */
  acceptsPaidJobs: false;
}>;

export async function checkWorkerHealth(
  dependencies: WorkerHealthDependencies,
): Promise<WorkerHealthReport> {
  let database: DatabaseHealth;
  try {
    database = await dependencies.checkDatabase();
  } catch {
    database = { ok: false, reason: "check_failed" };
  }

  return {
    status: database.ok ? "ready" : "degraded",
    checkedAt: dependencies.now().toISOString(),
    database,
    acceptsPaidJobs: false,
  };
}
