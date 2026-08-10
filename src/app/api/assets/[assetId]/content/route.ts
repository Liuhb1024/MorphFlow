import type { ReadStream } from "node:fs";

import { apiError, localBoundaryError } from "@/server/http/api-response";
import { validateLocalApiRequest } from "@/server/http/local-request";
import { createAssetReadStream } from "@/server/media/local-store";
import { ProjectRepository } from "@/server/projects/repository";
import { openLocalDatabase } from "@/server/runtime/local-database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = Readonly<{
  params: Promise<Readonly<{ assetId: string }>>;
}>;

function parseRange(value: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return "invalid";
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return "invalid";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) return "invalid";
  return { start, end: Math.min(requestedEnd, size - 1) };
}

function safeWebStream(nodeStream: ReadStream): ReadableStream<Uint8Array> {
  let closed = false;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      nodeStream.on("data", (chunk: string | Buffer) => {
        if (!closed) controller.enqueue(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      });
      nodeStream.once("end", () => { if (!closed) { closed = true; controller.close(); } });
      nodeStream.once("error", (error) => { if (!closed) { closed = true; controller.error(error); } });
      nodeStream.once("close", () => { if (!closed) { closed = true; controller.close(); } });
    },
    cancel() { closed = true; nodeStream.destroy(); },
  });
}

export async function GET(request: Request, context: RouteContext) {
  const local = validateLocalApiRequest(request, { mutation: false });
  if (!local.ok) return localBoundaryError(local);
  let handle;
  try {
    const { assetId } = await context.params;
    handle = openLocalDatabase();
    const asset = new ProjectRepository(handle.database).getAsset(assetId);
    const range = parseRange(request.headers.get("range"), asset.byteSize);
    if (range === "invalid") {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${asset.byteSize}` } });
    }
    const selected = range ?? { start: 0, end: asset.byteSize - 1 };
    const stream = safeWebStream(createAssetReadStream(handle.paths.root, asset, range ?? undefined));
    return new Response(stream, {
      status: range ? 206 : 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Length": String(selected.end - selected.start + 1),
        ...(range ? { "Content-Range": `bytes ${selected.start}-${selected.end}/${asset.byteSize}` } : {}),
        "Content-Type": asset.mimeType,
        "Content-Disposition": `inline; filename="${asset.id}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Asset not found") {
      return apiError("asset_not_found", 404);
    }
    if (error instanceof Error && error.message.startsWith("Invalid asset")) {
      return apiError("invalid_asset_id", 400);
    }
    return apiError("asset_content_unavailable", 404);
  } finally {
    handle?.close();
  }
}
