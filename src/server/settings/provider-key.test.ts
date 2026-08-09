import { describe, expect, it } from "vitest";

import { MemorySecretStore } from "../secrets/keychain";
import { createProviderKeyHandlers } from "./provider-key";

function localRequest(method: string, body?: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/settings/provider-key", {
    method,
    headers: {
      host: "localhost:3000",
      origin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("provider key handlers", () => {
  it("stores a key but returns only configured state and last four", async () => {
    const store = new MemorySecretStore();
    const handlers = createProviderKeyHandlers(store);
    const secret = ["morph", "flow", "provider", "canary"].join("_");

    const put = await handlers.PUT(localRequest("PUT", { key: secret }));
    const get = await handlers.GET(localRequest("GET"));
    const serialized = JSON.stringify(await get.json());

    expect(put.status).toBe(200);
    expect(get.status).toBe(200);
    expect(serialized).not.toContain(secret);
    expect(JSON.parse(serialized)).toEqual({ configured: true, lastFour: "nary" });
    expect(get.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects an external mutation without changing the store", async () => {
    const store = new MemorySecretStore();
    const handlers = createProviderKeyHandlers(store);

    const response = await handlers.PUT(
      localRequest("PUT", { key: "not_saved" }, "https://attacker.example"),
    );

    expect(response.status).toBe(403);
    await expect(store.status("dmxapi")).resolves.toEqual({ configured: false });
  });

  it("deletes an explicitly configured credential", async () => {
    const store = new MemorySecretStore();
    await store.set("dmxapi", "fixture_key_value");
    const handlers = createProviderKeyHandlers(store);

    const response = await handlers.DELETE(localRequest("DELETE"));

    expect(response.status).toBe(200);
    await expect(store.status("dmxapi")).resolves.toEqual({ configured: false });
  });
});
