import { assetDto } from "@/server/dal/projects";
import { generateEditedImage } from "@/server/generation/image";
import { ApiInputError, apiError, localBoundaryError, noStoreJson, readJsonBody } from "@/server/http/api-response";
import { validateLocalApiRequest } from "@/server/http/local-request";
import { DmxApiClient, DmxApiError } from "@/server/providers/dmxapi/client";
import { MacOSKeychain } from "@/server/secrets/keychain";
import { openLocalDatabase } from "@/server/runtime/local-database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const local = validateLocalApiRequest(request, { mutation: true });
  if (!local.ok) return localBoundaryError(local);
  let handle;
  try {
    const body = await readJsonBody(request, 64 * 1_024) as Record<string, unknown>;
    if (!body || typeof body !== "object" || !Array.isArray(body.referenceAssetIds) || body.confirmCostCny !== 0.3) {
      throw new ApiInputError("invalid_image_generation_request");
    }
    const { projectId } = await context.params;
    handle = openLocalDatabase();
    const asset = await generateEditedImage({
      database: handle.database,
      dataRoot: handle.paths.root,
      client: new DmxApiClient({ secretStore: new MacOSKeychain() }),
      projectId,
      referenceAssetIds: body.referenceAssetIds.filter((id): id is string => typeof id === "string"),
      prompt: typeof body.prompt === "string" ? body.prompt : "",
      size: typeof body.size === "string" ? body.size : "auto",
      quality: typeof body.quality === "string" ? body.quality : "auto",
      background: typeof body.background === "string" ? body.background : "auto",
      outputFormat: body.outputFormat === "jpeg" || body.outputFormat === "webp" ? body.outputFormat : "png",
    });
    return noStoreJson({ asset: assetDto(asset) }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiInputError) return apiError(error.code, error.status);
    if (error instanceof DmxApiError) return apiError(error.code, error.status ?? 502);
    if (error instanceof Error && error.message.startsWith("invalid_")) return apiError(error.message, 400);
    return apiError("image_generation_failed", 502);
  } finally { handle?.close(); }
}
