import { pollVideoTask } from "@/server/generation/video";
import { apiError, localBoundaryError, noStoreJson } from "@/server/http/api-response";
import { validateLocalApiRequest } from "@/server/http/local-request";
import { DmxApiClient, DmxApiError } from "@/server/providers/dmxapi/client";
import { openLocalDatabase } from "@/server/runtime/local-database";
import { MacOSKeychain } from "@/server/secrets/keychain";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ projectId: string; taskId: string }> }) {
  const local = validateLocalApiRequest(request, { mutation: true });
  if (!local.ok) return localBoundaryError(local);
  let handle;
  try {
    const { projectId, taskId } = await context.params;
    handle = openLocalDatabase();
    const task = await pollVideoTask({ database: handle.database, dataRoot: handle.paths.root, client: new DmxApiClient({ secretStore: new MacOSKeychain() }), projectId, taskId });
    return noStoreJson({ task: { id: task.id, capabilityId: task.capabilityId, modelId: task.modelId, status: task.status, providerTaskId: task.providerTaskId, resultAssetId: task.resultAssetId, resultUrl: task.resultAssetId ? `/api/assets/${encodeURIComponent(task.resultAssetId)}/content` : null, errorCode: task.errorCode, estimatedCostCny: task.estimatedCostCny, createdAt: task.createdAt, updatedAt: task.updatedAt } });
  } catch (error) {
    if (error instanceof DmxApiError) return apiError(error.code, error.status ?? 502);
    if (error instanceof Error && (error.message === "Video task not found" || error.message.startsWith("Invalid video task"))) return apiError("video_task_not_found", 404);
    return apiError("video_poll_failed", 502);
  } finally { handle?.close(); }
}
