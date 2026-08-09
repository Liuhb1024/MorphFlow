import { execFile } from "node:child_process";

type CommandHealth =
  | Readonly<{ ok: true; firstLine: string }>
  | Readonly<{ ok: false }>;

export type CommandProbe = (
  executable: string,
  args: readonly string[],
) => Promise<CommandHealth>;

export type DatabaseHealth =
  | Readonly<{ ok: true; state: "ready" | "initializable" }>
  | Readonly<{ ok: false; state: "unconfigured" | "unavailable" }>;

export type LocalRuntimeHealth = Readonly<{
  node: Readonly<{ ok: true; version: string }>;
  ffmpeg:
    | Readonly<{ ok: true; version: string }>
    | Readonly<{ ok: false }>;
  ffprobe:
    | Readonly<{ ok: true; version: string }>
    | Readonly<{ ok: false }>;
  database: DatabaseHealth;
  worker: Readonly<{ ok: false; state: "offline" }>;
  credential: Readonly<{ configured: false }>;
}>;

export const probeLocalCommand: CommandProbe = (executable, args) =>
  new Promise((resolve) => {
    execFile(
      executable,
      [...args],
      {
        encoding: "utf8",
        maxBuffer: 16 * 1_024,
        shell: false,
        timeout: 3_000,
      },
      (error, stdout) => {
        if (error) {
          resolve({ ok: false });
          return;
        }

        const firstLine = stdout.split(/\r?\n/, 1)[0]?.trim();
        resolve(firstLine ? { ok: true, firstLine } : { ok: false });
      },
    );
  });

export async function collectLocalRuntimeHealth(options: {
  nodeVersion: string;
  probe?: CommandProbe;
  databaseProbe?: () => Promise<DatabaseHealth>;
}): Promise<LocalRuntimeHealth> {
  const probe = options.probe ?? probeLocalCommand;
  const [ffmpeg, ffprobe, database] = await Promise.all([
    probe("ffmpeg", ["-version"]),
    probe("ffprobe", ["-version"]),
    options.databaseProbe?.() ??
      Promise.resolve({ ok: false as const, state: "unconfigured" as const }),
  ]);

  return {
    node: { ok: true, version: options.nodeVersion },
    ffmpeg: ffmpeg.ok
      ? { ok: true, version: ffmpeg.firstLine }
      : { ok: false },
    ffprobe: ffprobe.ok
      ? { ok: true, version: ffprobe.firstLine }
      : { ok: false },
    database,
    worker: { ok: false, state: "offline" },
    credential: { configured: false },
  };
}
