import { describe, expect, it, vi } from "vitest";

import {
  KEYCHAIN_SERVICE,
  MacOSKeychain,
  MemorySecretStore,
  type KeychainCommandRunner,
} from "./keychain";

describe("MacOSKeychain", () => {
  it("sends a secret over controlled stdin, never in argv", async () => {
    const secret = ["morph", "flow", "keychain", "canary"].join("_");
    const runner = vi.fn<KeychainCommandRunner>().mockResolvedValue({
      stdout: "",
      stderr: "",
    });
    const keychain = new MacOSKeychain({ runner });

    await keychain.set("dmxapi", secret);

    expect(runner).toHaveBeenCalledWith(
      "/usr/bin/security",
      [
        "add-generic-password",
        "-U",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        "dmxapi/default",
        "-w",
      ],
      { stdin: `${secret}\n${secret}\n`, detached: true, shell: false },
    );
    expect(JSON.stringify(runner.mock.calls[0]?.[1])).not.toContain(secret);
  });

  it("rejects provider identifiers that are not server-controlled", async () => {
    const runner = vi.fn<KeychainCommandRunner>();
    const keychain = new MacOSKeychain({ runner });

    await expect(keychain.get("dmxapi; open /tmp/owned")).rejects.toThrow(
      "Unsupported credential provider",
    );
    expect(runner).not.toHaveBeenCalled();
  });

  it("supports an injectable fake without touching the real keychain", async () => {
    const secret = ["morph", "flow", "read", "canary"].join("_");
    const runner = vi.fn<KeychainCommandRunner>().mockResolvedValue({
      stdout: `${secret}\n`,
      stderr: "",
    });
    const keychain = new MacOSKeychain({ runner });

    await expect(keychain.get("dmxapi")).resolves.toBe(secret);
    expect(runner).toHaveBeenCalledWith(
      "/usr/bin/security",
      [
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        "dmxapi/default",
        "-w",
      ],
      { detached: true, shell: false },
    );
  });

  it("does not expose command output when the keychain command fails", async () => {
    const secret = ["morph", "flow", "error", "canary"].join("_");
    const runner: KeychainCommandRunner = async () => {
      throw new Error(`security failed and printed ${secret}`);
    };
    const keychain = new MacOSKeychain({ runner });

    await expect(keychain.get("dmxapi")).rejects.toThrow(
      "Unable to read credential from macOS Keychain",
    );
    await expect(keychain.get("dmxapi")).rejects.not.toThrow(secret);
  });

  it("does not expose stdin when saving a credential fails", async () => {
    const secret = ["morph", "flow", "stdin", "canary"].join("_");
    const runner: KeychainCommandRunner = async (_executable, _args, options) => {
      throw new Error(`security failed with input ${options.stdin}`);
    };
    const keychain = new MacOSKeychain({ runner });

    await expect(keychain.set("dmxapi", secret)).rejects.toThrow(
      "Unable to save credential to macOS Keychain",
    );
    await expect(keychain.set("dmxapi", secret)).rejects.not.toThrow(secret);
  });

  it("rejects multiline credentials before starting a process", async () => {
    const runner = vi.fn<KeychainCommandRunner>();
    const keychain = new MacOSKeychain({ runner });

    await expect(keychain.set("dmxapi", "first-line\nsecond-line")).rejects.toThrow(
      "Credential has an invalid format",
    );
    expect(runner).not.toHaveBeenCalled();
  });

  it("provides an in-memory SecretStore for integration tests", async () => {
    const fake = new MemorySecretStore();
    const secret = ["morph", "flow", "memory", "canary"].join("_");

    await fake.set("dmxapi", secret);
    await expect(fake.get("dmxapi")).resolves.toBe(secret);
    await expect(fake.status("dmxapi")).resolves.toEqual({
      configured: true,
      lastFour: "nary",
    });

    await fake.delete("dmxapi");
    await expect(fake.status("dmxapi")).resolves.toEqual({ configured: false });
  });
});
