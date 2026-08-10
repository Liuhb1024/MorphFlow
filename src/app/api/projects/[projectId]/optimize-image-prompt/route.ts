import { optimizeImagePrompt } from "@/server/generation/prompt-optimizer";
import { ApiInputError, apiError, localBoundaryError, noStoreJson, readJsonBody } from "@/server/http/api-response";
import { validateLocalApiRequest } from "@/server/http/local-request";
import { DmxApiClient, DmxApiError } from "@/server/providers/dmxapi/client";
import { ProjectRepository } from "@/server/projects/repository";
import { openLocalDatabase } from "@/server/runtime/local-database";
import { MacOSKeychain } from "@/server/secrets/keychain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const local = validateLocalApiRequest(request, { mutation: true });
  if (!local.ok) return localBoundaryError(local);
  let handle;
  try {
    const body = await readJsonBody(request, 32 * 1_024) as Record<string, unknown>;
    if (!body || typeof body !== "object" || body.confirmed !== true || typeof body.prompt !== "string" || !Array.isArray(body.referenceAssetIds) || typeof body.aspectRatio !== "string") throw new ApiInputError("invalid_prompt_optimization_request");
    const { projectId } = await context.params;
    handle = openLocalDatabase(); new ProjectRepository(handle.database).getProject(projectId);
    const prompt = await optimizeImagePrompt({
      database: handle.database,
      dataRoot: handle.paths.root,
      client: new DmxApiClient({ secretStore: new MacOSKeychain() }),
      projectId,
      referenceAssetIds: body.referenceAssetIds.filter((id): id is string => typeof id === "string"),
      draft: body.prompt,
      aspectRatio: body.aspectRatio,
    });
    return noStoreJson({ prompt });
  } catch (error) {
    if (error instanceof ApiInputError) return apiError(error.code, error.status);
    if (error instanceof DmxApiError) return apiError(error.code, error.status ?? 502);
    if (error instanceof Error && error.message.startsWith("invalid_")) return apiError(error.message, 400);
    return apiError("prompt_optimization_failed", 502);
  } finally { handle?.close(); }
}
