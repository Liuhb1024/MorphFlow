import { spawn } from "node:child_process";

export const KEYCHAIN_SERVICE = "cn.morphflow.local";
const SECURITY_EXECUTABLE = "/usr/bin/security";
const MAX_SECRET_LENGTH = 16_384;

const PROVIDER_ACCOUNTS = {
  dmxapi: "dmxapi/default",
} as const;

export type CredentialProvider = keyof typeof PROVIDER_ACCOUNTS;

export type KeychainCommandResult = Readonly<{
  stdout: string;
  stderr: string;
}>;

export type KeychainCommandOptions = Readonly<{
  /** Present only for commands that intentionally consume controlled stdin. */
  stdin?: string;
  /** Prevent macOS `security` from reading secrets from the parent's terminal. */
  detached: true;
  /** The command boundary never permits shell evaluation. */
  shell: false;
}>;

/** A process-runner boundary. Tests inject a fake and never invoke Keychain. */
export type KeychainCommandRunner = (
  executable: string,
  args: readonly string[],
  options: KeychainCommandOptions,
) => Promise<KeychainCommandResult>;

export interface SecretStore {
  set(provider: string, secret: string): Promise<void>;
  get(provider: string): Promise<string>;
  delete(provider: string): Promise<void>;
  status(provider: string): Promise<CredentialStatus>;
}

export type CredentialStatus = Readonly<{
  configured: boolean;
  lastFour?: string;
}>;

function runSecurityCommand(
  executable: string,
  args: readonly string[],
  options: KeychainCommandOptions,
): Promise<KeychainCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [...args],
      {
        detached: options.detached,
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    const chunks = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
    let bufferedBytes = 0;
    let settled = false;

    const finish = (
      result: { stdout: string; stderr: string } | Error,
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    const collect = (stream: "stdout" | "stderr", chunk: Buffer): void => {
      bufferedBytes += chunk.byteLength;
      if (bufferedBytes > 64 * 1_024) {
        child.kill();
        finish(new Error("Keychain command output exceeded the safe limit"));
        return;
      }
      chunks[stream].push(chunk);
    };

    child.stdout.on("data", (chunk: Buffer) => collect("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => collect("stderr", chunk));
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (code !== 0) {
        finish(new Error("Keychain command failed"));
        return;
      }
      finish({
        stdout: Buffer.concat(chunks.stdout).toString("utf8"),
        stderr: Buffer.concat(chunks.stderr).toString("utf8"),
      });
    });

    const timeout = setTimeout(() => {
      child.kill();
      finish(new Error("Keychain command timed out"));
    }, 10_000);

    // `security add-generic-password -w` reads the password from stdin when
    // `-w` is the final option. Keeping it out of argv avoids process-list
    // disclosure. The stream is always closed, including commands with no input.
    child.stdin?.end(options.stdin ?? "");
  });
}

function accountFor(provider: string): string {
  if (!Object.hasOwn(PROVIDER_ACCOUNTS, provider)) {
    throw new Error("Unsupported credential provider");
  }
  return PROVIDER_ACCOUNTS[provider as CredentialProvider];
}

function validateSecret(secret: string): void {
  if (secret.trim().length === 0) {
    throw new Error("Credential must not be empty");
  }
  if (secret.length > MAX_SECRET_LENGTH || /[\0\r\n]/.test(secret)) {
    throw new Error("Credential has an invalid format");
  }
}

export class MacOSKeychain implements SecretStore {
  private readonly runner: KeychainCommandRunner;

  constructor(options: { runner?: KeychainCommandRunner } = {}) {
    this.runner = options.runner ?? runSecurityCommand;
  }

  async set(provider: string, secret: string): Promise<void> {
    const account = accountFor(provider);
    validateSecret(secret);
    try {
      await this.runner(
        SECURITY_EXECUTABLE,
        [
          "add-generic-password",
          "-U",
          "-s",
          KEYCHAIN_SERVICE,
          "-a",
          account,
          "-w",
        ],
        {
          // With a bare `-w`, macOS asks for the value and confirmation. Feed
          // both prompts over stdin while keeping the secret out of argv.
          stdin: `${secret}\n${secret}\n`,
          detached: true,
          shell: false,
        },
      );
    } catch {
      throw new Error("Unable to save credential to macOS Keychain");
    }
  }

  async get(provider: string): Promise<string> {
    const account = accountFor(provider);
    try {
      const result = await this.runner(
        SECURITY_EXECUTABLE,
        [
          "find-generic-password",
          "-s",
          KEYCHAIN_SERVICE,
          "-a",
          account,
          "-w",
        ],
        { detached: true, shell: false },
      );
      const secret = result.stdout.replace(/[\r\n]+$/, "");
      if (secret.length === 0) {
        throw new Error("empty credential");
      }
      return secret;
    } catch {
      throw new Error("Unable to read credential from macOS Keychain");
    }
  }

  async delete(provider: string): Promise<void> {
    const account = accountFor(provider);
    try {
      await this.runner(
        SECURITY_EXECUTABLE,
        [
          "delete-generic-password",
          "-s",
          KEYCHAIN_SERVICE,
          "-a",
          account,
        ],
        { detached: true, shell: false },
      );
    } catch {
      throw new Error("Unable to delete credential from macOS Keychain");
    }
  }

  async status(provider: string): Promise<CredentialStatus> {
    try {
      const secret = await this.get(provider);
      return {
        configured: true,
        lastFour: secret.slice(-4),
      };
    } catch {
      accountFor(provider);
      return { configured: false };
    }
  }
}

/** Deterministic fake for tests; it never invokes `/usr/bin/security`. */
export class MemorySecretStore implements SecretStore {
  private readonly secrets = new Map<CredentialProvider, string>();

  async set(provider: string, secret: string): Promise<void> {
    accountFor(provider);
    validateSecret(secret);
    this.secrets.set(provider as CredentialProvider, secret);
  }

  async get(provider: string): Promise<string> {
    accountFor(provider);
    const secret = this.secrets.get(provider as CredentialProvider);
    if (secret === undefined) {
      throw new Error("Credential is not configured");
    }
    return secret;
  }

  async delete(provider: string): Promise<void> {
    accountFor(provider);
    this.secrets.delete(provider as CredentialProvider);
  }

  async status(provider: string): Promise<CredentialStatus> {
    accountFor(provider);
    const secret = this.secrets.get(provider as CredentialProvider);
    return secret === undefined
      ? { configured: false }
      : { configured: true, lastFour: secret.slice(-4) };
  }
}
