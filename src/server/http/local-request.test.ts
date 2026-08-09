import { describe, expect, it } from "vitest";

import { validateLocalApiRequest } from "./local-request";

function request(url: string, init: RequestInit = {}): Request {
  return new Request(url, init);
}

describe("validateLocalApiRequest", () => {
  it("accepts local read requests", () => {
    const result = validateLocalApiRequest(
      request("http://127.0.0.1:3000/api/projects", {
        headers: { host: "127.0.0.1:3000" },
      }),
      { mutation: false },
    );

    expect(result).toEqual({ ok: true });
  });

  it("requires an exact local origin for mutations", () => {
    const valid = validateLocalApiRequest(
      request("http://localhost:3000/api/projects", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "http://localhost:3000",
        },
      }),
      { mutation: true },
    );
    const external = validateLocalApiRequest(
      request("http://localhost:3000/api/projects", {
        method: "POST",
        headers: {
          host: "localhost:3000",
          origin: "https://attacker.example",
        },
      }),
      { mutation: true },
    );

    expect(valid).toEqual({ ok: true });
    expect(external).toEqual({ ok: false, status: 403, code: "invalid_origin" });
  });

  it.each([
    "example.com",
    "localhost.evil.example",
    "127.0.0.1.evil.example",
    "localhost@evil.example",
    "localhost, evil.example",
  ])("rejects a non-local or ambiguous Host: %s", (host) => {
    expect(
      validateLocalApiRequest(
        request("http://localhost:3000/api/projects", { headers: { host } }),
        { mutation: false },
      ),
    ).toEqual({ ok: false, status: 403, code: "invalid_host" });
  });

  it("rejects forwarded-host headers", () => {
    expect(
      validateLocalApiRequest(
        request("http://localhost:3000/api/projects", {
          headers: {
            host: "localhost:3000",
            "x-forwarded-host": "attacker.example",
          },
        }),
        { mutation: false },
      ),
    ).toEqual({ ok: false, status: 403, code: "forwarded_host_forbidden" });
  });

  it("accepts Next.js local forwarding when forwarded host exactly matches Host", () => {
    expect(
      validateLocalApiRequest(
        request("http://127.0.0.1:3000/api/projects", {
          headers: {
            host: "127.0.0.1:3000",
            "x-forwarded-host": "127.0.0.1:3000",
          },
        }),
        { mutation: false },
      ),
    ).toEqual({ ok: true });
  });

  it("accepts a local canonical request URL with an equivalent local Host", () => {
    expect(
      validateLocalApiRequest(
        request("http://localhost:3000/api/projects", {
          method: "POST",
          headers: {
            host: "127.0.0.1:3000",
            origin: "http://127.0.0.1:3000",
            "x-forwarded-host": "127.0.0.1:3000",
          },
        }),
        { mutation: true },
      ),
    ).toEqual({ ok: true });
  });
});
