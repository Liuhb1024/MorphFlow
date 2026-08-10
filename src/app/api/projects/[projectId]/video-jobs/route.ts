import { getCapability } from "@/model-registry/registry";
import { submitVideoTask, VideoGenerationValidationError } from "@/server/generation/video";
import { VideoTaskRepository, type VideoTask } from "@/server/generation/video-tasks";
import { ApiInputError, apiError, localBoundaryError, noStoreJson, readJsonBody } from "@/server/http/api-response";
import { validateLocalApiRequest } from "@/server/http/local-request";
import { DmxApiClient, DmxApiError } from "@/server/providers/dmxapi/client";
import { openLocalDatabase } from "@/server/runtime/local-database";
import { MacOSKeychain } from "@/server/secrets/keychain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function dto(task: VideoTask) {
  return { id: task.id, capabilityId: task.capabilityId, modelId: task.modelId, status: task.status, providerTaskId: task.providerTaskId, resultAssetId: task.resultAssetId, resultUrl: task.resultAssetId ? `/api/assets/${encodeURIComponent(task.resultAssetId)}/content` : null, errorCode: task.errorCode, estimatedCostCny: task.estimatedCostCny, createdAt: task.createdAt, updatedAt: task.updatedAt };
}

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: Context) {
  const local = validateLocalApiRequest(request, { mutation: false });
  if (!local.ok) return localBoundaryError(local);
  let handle;
  try {
    const { projectId } = await context.params;
    handle = openLocalDatabase();
    return noStoreJson({ tasks: new VideoTaskRepository(handle.database).list(projectId).map(dto) });
  } catch { return apiError("video_tasks_unavailable", 503); }
  finally { handle?.close(); }
}

export async function POST(request: Request, context: Context) {
  const local = validateLocalApiRequest(request, { mutation: true });
  if (!local.ok) return localBoundaryError(local);
  let handle;
  try {
    const body = await readJsonBody(request, 160 * 1_024) as Record<string, unknown>;
    if (!body || typeof body !== "object" || body.confirmed !== true || typeof body.capabilityId !== "string" || typeof body.values !== "object" || body.values === null || Array.isArray(body.values) || typeof body.bindings !== "object" || body.bindings === null || Array.isArray(body.bindings)) throw new ApiInputError("invalid_video_generation_request");
    const capability = getCapability(body.capabilityId);
    if (capability.category !== "video") throw new ApiInputError("invalid_video_generation_request");
    const bindings = Object.fromEntries(Object.entries(body.bindings as Record<string, unknown>).map(([key, value]) => [key, Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : typeof value === "string" ? [value] : []]));
    const { projectId } = await context.params;
    handle = openLocalDatabase();
    const task = await submitVideoTask({ database: handle.database, dataRoot: handle.paths.root, client: new DmxApiClient({ secretStore: new MacOSKeychain() }), projectId, capabilityId: body.capabilityId, values: body.values as Record<string, unknown>, bindings });
    return noStoreJson({ task: dto(task) }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiInputError) return apiError(error.code, error.status);
    if (error instanceof VideoGenerationValidationError) {
      return noStoreJson(
        { error: error.message, issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof DmxApiError) return apiError(error.code, error.status ?? 502);
    if (error instanceof Error && (error.message.startsWith("invalid_") || error.message.startsWith("unsupported_") || error.message.startsWith("Unknown capability"))) return apiError(error.message, 400);
    return apiError("video_submission_failed", 502);
  } finally { handle?.close(); }
}
