import { NextResponse } from "next/server";

export class ApiInputError extends Error {
  constructor(
    readonly code: string,
    readonly status: number = 400,
  ) {
    super(code);
    this.name = "ApiInputError";
  }
}

export function noStoreJson(body: unknown, init: ResponseInit = {}): NextResponse {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

export function apiError(code: string, status: number): NextResponse {
  return noStoreJson({ error: code }, { status });
}

export function localBoundaryError(
  result: Readonly<{ ok: false; status: number; code: string }>,
): NextResponse {
  return apiError(result.code, result.status);
}

export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new ApiInputError("json_content_type_required", 415);
  }
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > maxBytes) {
      throw new ApiInputError("request_body_too_large", 413);
    }
  }
  if (!request.body) throw new ApiInputError("invalid_json");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      byteLength += result.value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new ApiInputError("request_body_too_large", 413);
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
      ),
    );
  } catch (error) {
    if (error instanceof ApiInputError) throw error;
    throw new ApiInputError("invalid_json");
  }
}
