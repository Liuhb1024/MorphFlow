import { projectDto } from "@/server/dal/projects";
import {
  ApiInputError,
  apiError,
  localBoundaryError,
  noStoreJson,
  readJsonBody,
} from "@/server/http/api-response";
import { validateLocalApiRequest } from "@/server/http/local-request";
import {
  quarantineProjectMedia,
  type ProjectMediaQuarantine,
} from "@/server/media/local-store";
import { ProjectRepository } from "@/server/projects/repository";
import { openLocalDatabase } from "@/server/runtime/local-database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProjectRouteContext = Readonly<{
  params: Promise<{ projectId: string }>;
}>;

function projectMutationError(error: unknown) {
  if (error instanceof ApiInputError) return apiError(error.code, error.status);
  if (error instanceof Error) {
    if (error.message === "Project not found") return apiError("project_not_found", 404);
    if (error.message.startsWith("Invalid ")) return apiError("invalid_project_request", 400);
  }
  return apiError("local_data_unavailable", 503);
}

export async function PATCH(request: Request, context: ProjectRouteContext) {
  const local = validateLocalApiRequest(request, { mutation: true });
  if (!local.ok) return localBoundaryError(local);
  let handle;
  try {
    const { projectId } = await context.params;
    const body = await readJsonBody(request, 16 * 1_024);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new ApiInputError("invalid_project_request");
    }
    const input = body as Record<string, unknown>;
    if (
      (input.name === undefined && input.description === undefined) ||
      (input.name !== undefined && typeof input.name !== "string") ||
      (input.description !== undefined && typeof input.description !== "string")
    ) {
      throw new ApiInputError("invalid_project_request");
    }
    handle = openLocalDatabase();
    const project = new ProjectRepository(handle.database).updateProject(projectId, {
      ...(typeof input.name === "string" ? { name: input.name } : {}),
      ...(typeof input.description === "string" ? { description: input.description } : {}),
    });
    return noStoreJson({ project: projectDto(project) });
  } catch (error) {
    return projectMutationError(error);
  } finally {
    handle?.close();
  }
}

export async function DELETE(request: Request, context: ProjectRouteContext) {
  const local = validateLocalApiRequest(request, { mutation: true });
  if (!local.ok) return localBoundaryError(local);
  let handle;
  let quarantine: ProjectMediaQuarantine | undefined;
  let databaseDeleted = false;
  try {
    const { projectId } = await context.params;
    handle = openLocalDatabase();
    const repository = new ProjectRepository(handle.database);
    repository.getProject(projectId);
    quarantine = await quarantineProjectMedia(handle.paths.root, projectId);
    repository.deleteProject(projectId);
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
    return projectMutationError(error);
  } finally {
    handle?.close();
  }
}
