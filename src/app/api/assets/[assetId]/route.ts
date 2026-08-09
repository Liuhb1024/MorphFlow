import { assetDto } from "@/server/dal/projects";
import { apiError, localBoundaryError, noStoreJson } from "@/server/http/api-response";
import { validateLocalApiRequest } from "@/server/http/local-request";
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
    return noStoreJson({ asset: assetDto(asset) });
  } catch (error) {
    if (error instanceof Error && error.message === "Asset not found") {
      return apiError("asset_not_found", 404);
    }
    if (error instanceof Error && error.message.startsWith("Invalid asset")) {
      return apiError("invalid_asset_id", 400);
    }
    return apiError("local_data_unavailable", 503);
  } finally {
    handle?.close();
  }
}
