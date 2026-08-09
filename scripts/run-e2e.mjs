import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataDirectory = mkdtempSync(join(tmpdir(), "morphflow-e2e-"));

try {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "playwright", "test"], {
      env: {
        ...process.env,
        MORPHFLOW_DATA_DIR: dataDirectory,
        MORPHFLOW_E2E_PORT: "3011",
      },
      shell: false,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  rmSync(dataDirectory, { force: true, recursive: true });
}
