const REDACTED = "[REDACTED]";
const CIRCULAR = "[Circular]";
const MAX_DEPTH_REACHED = "[Max depth reached]";
const TRUNCATED = "[Truncated]";

const SENSITIVE_FIELD =
  /(?:^|[-_])(authorization|proxy[-_]?authorization|cookie|set[-_]?cookie|api[-_]?key|token|secret|signature|credential|password|passwd)(?:$|[-_])/i;

const BEARER_VALUE = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi;
const KEY_PREFIX_VALUE =
  /\b(?:sk|pk|rk|api|key)[-_][A-Za-z0-9_-]{16,}\b/gi;
const JWT_VALUE = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const HIGH_ENTROPY_VALUE =
  /\b(?=[A-Za-z0-9_+/=-]{24,}\b)(?=[A-Za-z0-9_+/=-]*[A-Z])(?=[A-Za-z0-9_+/=-]*[a-z])(?=[A-Za-z0-9_+/=-]*\d)[A-Za-z0-9_+/=-]{24,}\b/g;
const COOKIE_TEXT =
  /\b(?:set-cookie|cookie)\s*[:=]\s*[^\r\n,]+/gi;
const HTTP_URL = /https?:\/\/[^\s"'<>]+/gi;

export type RedactionOptions = Readonly<{
  maxDepth?: number;
  maxEntries?: number;
  maxStringLength?: number;
}>;

type ResolvedRedactionOptions = Readonly<{
  maxDepth: number;
  maxEntries: number;
  maxStringLength: number;
}>;

function normalizeOptions(options: RedactionOptions): ResolvedRedactionOptions {
  return {
    maxDepth: Math.max(0, options.maxDepth ?? 8),
    maxEntries: Math.max(1, options.maxEntries ?? 100),
    maxStringLength: Math.max(32, options.maxStringLength ?? 4_096),
  };
}

function isSensitiveField(field: string): boolean {
  const normalized = field.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
  return SENSITIVE_FIELD.test(`_${normalized}_`);
}

function stripUrlSecrets(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return REDACTED;
    }
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return REDACTED;
  }
}

function sanitizeString(value: string, options: ResolvedRedactionOptions): string {
  const sanitized = value
    .replace(HTTP_URL, (url) => stripUrlSecrets(url))
    .replace(BEARER_VALUE, "$1 [REDACTED]")
    .replace(COOKIE_TEXT, REDACTED)
    .replace(KEY_PREFIX_VALUE, REDACTED)
    .replace(JWT_VALUE, REDACTED)
    .replace(HIGH_ENTROPY_VALUE, REDACTED);

  if (sanitized.length <= options.maxStringLength) {
    return sanitized;
  }
  return `${sanitized.slice(0, options.maxStringLength)}${TRUNCATED}`;
}

/**
 * Produces a JSON-serializable, bounded copy suitable for local logs and
 * provider snapshots. The original value is never mutated.
 */
export function redactForLog(
  value: unknown,
  options: RedactionOptions = {},
): unknown {
  const resolved = normalizeOptions(options);
  const seen = new WeakSet<object>();

  const visit = (current: unknown, depth: number, field?: string): unknown => {
    if (field !== undefined && isSensitiveField(field)) {
      return REDACTED;
    }
    if (current === null || current === undefined) {
      return current ?? null;
    }
    if (typeof current === "string") {
      return sanitizeString(current, resolved);
    }
    if (typeof current === "number" || typeof current === "boolean") {
      return current;
    }
    if (typeof current === "bigint") {
      return current.toString();
    }
    if (typeof current === "symbol" || typeof current === "function") {
      return `[${typeof current}]`;
    }
    if (depth >= resolved.maxDepth) {
      return MAX_DEPTH_REACHED;
    }

    const object = current as object;
    if (seen.has(object)) {
      return CIRCULAR;
    }
    seen.add(object);

    if (current instanceof Error) {
      return {
        name: sanitizeString(current.name, resolved),
        message: sanitizeString(current.message, resolved),
        ...(current.cause === undefined
          ? {}
          : { cause: visit(current.cause, depth + 1, "cause") }),
      };
    }
    if (current instanceof Date) {
      return Number.isNaN(current.getTime()) ? "Invalid Date" : current.toISOString();
    }
    if (current instanceof URL) {
      return stripUrlSecrets(current.href);
    }
    if (ArrayBuffer.isView(current)) {
      return `[Binary ${current.byteLength} bytes]`;
    }
    if (current instanceof ArrayBuffer) {
      return `[Binary ${current.byteLength} bytes]`;
    }
    if (Array.isArray(current)) {
      const values = current
        .slice(0, resolved.maxEntries)
        .map((item) => visit(item, depth + 1));
      if (current.length > resolved.maxEntries) {
        values.push(TRUNCATED);
      }
      return values;
    }

    const output: Record<string, unknown> = {};
    let emitted = 0;
    for (const key of Object.keys(current as Record<string, unknown>)) {
      if (emitted >= resolved.maxEntries) {
        output.__truncated__ = TRUNCATED;
        break;
      }
      try {
        output[key] = visit(
          (current as Record<string, unknown>)[key],
          depth + 1,
          key,
        );
      } catch {
        output[key] = "[Unserializable]";
      }
      emitted += 1;
    }
    return output;
  };

  try {
    return visit(value, 0);
  } catch {
    return "[Unserializable]";
  }
}
