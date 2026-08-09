export type LocalRequestValidation =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      status: 403;
      code: "invalid_host" | "invalid_origin" | "forwarded_host_forbidden";
    }>;

function parseAllowedHost(rawHost: string | null): URL | null {
  if (
    rawHost === null ||
    rawHost.length > 255 ||
    rawHost.includes(",") ||
    rawHost.includes("@") ||
    /[\s\\/]/.test(rawHost)
  ) {
    return null;
  }
  try {
    const parsed = new URL(`http://${rawHost}`);
    if (parsed.username || parsed.password || parsed.pathname !== "/") {
      return null;
    }
    if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      return null;
    }
    if (parsed.port) {
      const port = Number(parsed.port);
      if (!Number.isInteger(port) || port < 1 || port > 65_535) {
        return null;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

export function validateLocalApiRequest(
  request: Request,
  options: Readonly<{ mutation: boolean }>,
): LocalRequestValidation {
  if (request.headers.has("forwarded")) {
    return { ok: false, status: 403, code: "forwarded_host_forbidden" };
  }

  const host = request.headers.get("host");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost !== null && forwardedHost !== host) {
    return { ok: false, status: 403, code: "forwarded_host_forbidden" };
  }
  const parsedHost = parseAllowedHost(host);
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url);
  } catch {
    return { ok: false, status: 403, code: "invalid_host" };
  }
  if (
    parsedHost === null ||
    host === null ||
    (requestUrl.hostname !== "localhost" && requestUrl.hostname !== "127.0.0.1")
  ) {
    return { ok: false, status: 403, code: "invalid_host" };
  }

  if (options.mutation) {
    const origin = request.headers.get("origin");
    const expectedOrigin = `${requestUrl.protocol}//${host}`;
    if (origin === null || origin === "null" || origin !== expectedOrigin) {
      return { ok: false, status: 403, code: "invalid_origin" };
    }
  }

  return { ok: true };
}
