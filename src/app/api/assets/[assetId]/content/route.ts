import { Readable } from "node:stream";

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

export async function GET(request: Request, context: RouteContext) {
  const local = validateLocalApiRequest(request, { mutation: false });
  if (!local.ok) return localBoundaryError(local);
  let handle;
  try {
    const { assetId } = await context.params;
    handle = openLocalDatabase();
    const asset = new ProjectRepository(handle.database).getAsset(assetId);
    const stream = Readable.toWeb(createAssetReadStream(handle.paths.root, asset));
    return new Response(stream as ReadableStream, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Length": String(asset.byteSize),
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
