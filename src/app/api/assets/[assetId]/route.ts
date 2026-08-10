import { assetDto } from "@/server/dal/projects";
import { apiError, localBoundaryError, noStoreJson } from "@/server/http/api-response";
import { validateLocalApiRequest } from "@/server/http/local-request";
import {
  quarantineAssetMedia,
  type AssetMediaQuarantine,
} from "@/server/media/local-store";
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

export async function DELETE(request: Request, context: RouteContext) {
  const local = validateLocalApiRequest(request, { mutation: true });
  if (!local.ok) return localBoundaryError(local);
  let handle;
  let quarantine: AssetMediaQuarantine | undefined;
  let databaseDeleted = false;
  try {
    const { assetId } = await context.params;
    handle = openLocalDatabase();
    const repository = new ProjectRepository(handle.database);
    const asset = repository.getAsset(assetId);
    quarantine = await quarantineAssetMedia(handle.paths.root, asset);
    repository.deleteAsset(assetId);
    databaseDeleted = true;
    const cleanupPending = await quarantine.commit().then(
      () => false,
      () => true,
    );
    return noStoreJson({ deleted: true, cleanupPending });
  } catch (error) {
    if (quarantine && !databaseDeleted) {
      await quarantine.rollback().catch(() => undefined);
    }
    if (error instanceof Error && error.message === "Asset not found") {
      return apiError("asset_not_found", 404);
    }
    if (error instanceof Error && error.message.startsWith("Invalid asset")) {
      return apiError("invalid_asset_id", 400);
    }
    if (error instanceof Error && /constraint/i.test(error.message)) {
      return apiError("asset_in_use", 409);
    }
    return apiError("asset_delete_failed", 503);
  } finally {
    handle?.close();
  }
}
