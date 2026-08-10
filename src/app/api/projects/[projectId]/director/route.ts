import { generateDirectorAdvice } from "@/server/generation/director";
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
    if (!body || typeof body !== "object" || !Array.isArray(body.assetIds) || body.confirmed !== true || typeof body.capabilityId !== "string" || typeof body.duration !== "number" || typeof body.audio !== "boolean") throw new ApiInputError("invalid_director_request");
    const { projectId } = await context.params;
    handle = openLocalDatabase();
    const advice = await generateDirectorAdvice({ database: handle.database, dataRoot: handle.paths.root, client: new DmxApiClient({ secretStore: new MacOSKeychain() }), projectId, assetIds: body.assetIds.filter((id): id is string => typeof id === "string"), prompt: typeof body.prompt === "string" ? body.prompt : "", capabilityId: body.capabilityId, duration: body.duration, audio: body.audio });
    return noStoreJson({ advice });
  } catch (error) {
    if (error instanceof ApiInputError) return apiError(error.code, error.status);
    if (error instanceof DmxApiError) return apiError(error.code, error.status ?? 502);
    if (error instanceof Error && error.message.startsWith("invalid_")) return apiError(error.message, 400);
    return apiError("director_generation_failed", 502);
  } finally { handle?.close(); }
}
