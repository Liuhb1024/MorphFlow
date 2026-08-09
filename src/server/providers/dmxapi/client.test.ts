import { describe, expect, it, vi } from "vitest";

import { MemorySecretStore } from "../../secrets/keychain";
import {
  DMX_CHAT_COMPLETIONS_URL,
  DmxApiClient,
} from "./client";

async function configuredStore(secret = "test-provider-secret") {
  const store = new MemorySecretStore();
  await store.set("dmxapi", secret);
  return store;
}

describe("DmxApiClient", () => {
  it("sends a bounded OpenAI-compatible request without putting the key in the URL", async () => {
    const secret = "test-provider-secret";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: "chatcmpl_test",
        model: "gemini-3.6-flash",
        choices: [{ message: { role: "assistant", content: "OK" } }],
        usage: { prompt_tokens: 8, completion_tokens: 1, total_tokens: 9 },
      }),
    );
    const client = new DmxApiClient({
      secretStore: await configuredStore(secret),
      fetchImpl,
    });

    await expect(
      client.complete({
        model: "gemini-3.6-flash",
        messages: [{ role: "user", content: "只回复 OK" }],
        maxTokens: 4,
      }),
    ).resolves.toMatchObject({ text: "OK", model: "gemini-3.6-flash" });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(DMX_CHAT_COMPLETIONS_URL);
    expect(String(url)).not.toContain(secret);
    expect(new Headers(init?.headers).get("authorization")).toBe(secret);
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "gemini-3.6-flash",
      messages: [{ role: "user", content: "只回复 OK" }],
      temperature: 0,
      max_tokens: 4,
      stream: false,
    });
  });

  it("does not expose a provider error body or credential", async () => {
    const secret = "test-provider-secret";
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(`bad request ${secret}`, { status: 401 }));
    const client = new DmxApiClient({
      secretStore: await configuredStore(secret),
      fetchImpl,
    });

    const failure = client.complete({
      model: "gemini-3.6-flash",
      messages: [{ role: "user", content: "只回复 OK" }],
      maxTokens: 4,
    });

    await expect(failure).rejects.toMatchObject({
      code: "provider_http_error",
      status: 401,
    });
    await expect(failure).rejects.not.toThrow(secret);
  });

  it("rejects an oversized response instead of buffering it without a limit", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("x".repeat(300_000)));
    const client = new DmxApiClient({
      secretStore: await configuredStore(),
      fetchImpl,
      maxResponseBytes: 1_024,
    });

    await expect(
      client.complete({
        model: "gemini-3.6-flash",
        messages: [{ role: "user", content: "只回复 OK" }],
        maxTokens: 4,
      }),
    ).rejects.toEqual(expect.objectContaining({ code: "response_too_large" }));
  });
});
