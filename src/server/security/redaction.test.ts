import { describe, expect, it } from "vitest";

import { redactForLog } from "./redaction";

describe("redactForLog", () => {
  it("removes secrets from nested objects and signed URLs", () => {
    const secret = ["morph", "flow", "canary", "secret"].join("_");
    const result = redactForLog({
      authorization: `Bearer ${secret}`,
      nested: { apiKey: secret },
      resultUrl: `https://cdn.example/video.mp4?X-Amz-Signature=${secret}`,
      providerTaskId: "task_fixture_01",
    });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("X-Amz-Signature");
    expect(serialized).toContain("task_fixture_01");
  });

  it("redacts secrets in arrays, error messages, headers, and bearer text", () => {
    const secret = ["morph", "flow", "nested", "canary"].join("_");
    const result = redactForLog({
      headers: {
        cookie: `session=${secret}`,
        location: `https://cdn.example/result?id=public&token=${secret}`,
      },
      values: [new Error(`provider failed: Bearer ${secret}`)],
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("?id=public");
    expect(serialized).toContain("provider failed");
  });

  it("handles circular and excessively deep values without throwing", () => {
    const circular: Record<string, unknown> = { visible: "task_fixture_02" };
    circular.self = circular;
    circular.deep = { one: { two: { three: { four: { five: "end" } } } } };

    expect(() => redactForLog(circular, { maxDepth: 3 })).not.toThrow();
    expect(JSON.stringify(redactForLog(circular, { maxDepth: 3 }))).toContain(
      "task_fixture_02",
    );
  });

  it("scans free-form provider errors for high-entropy credential values", () => {
    const secret = ["Qf7vT2", "mP9xL4", "sR8cN6", "wK3jH5"].join("");
    const serialized = JSON.stringify(
      redactForLog({ message: `upstream rejected credential ${secret}` }),
    );

    expect(serialized).not.toContain(secret);
    expect(serialized).toContain("upstream rejected credential");
  });

  it("fails closed for values that cannot be inspected", () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("inspection denied");
        },
      },
    );

    expect(redactForLog(hostile)).toBe("[Unserializable]");
  });
});
