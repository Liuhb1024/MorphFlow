import {
  projectDto,
  listProjectSummaries,
} from "@/server/dal/projects";
import {
  ApiInputError,
  apiError,
  localBoundaryError,
  noStoreJson,
  readJsonBody,
} from "@/server/http/api-response";
import { validateLocalApiRequest } from "@/server/http/local-request";
import { ProjectRepository } from "@/server/projects/repository";
import { openLocalDatabase } from "@/server/runtime/local-database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const local = validateLocalApiRequest(request, { mutation: false });
  if (!local.ok) return localBoundaryError(local);
  try {
    return noStoreJson({ projects: listProjectSummaries() });
  } catch {
    return apiError("local_data_unavailable", 503);
  }
}

export async function POST(request: Request) {
  const local = validateLocalApiRequest(request, { mutation: true });
  if (!local.ok) return localBoundaryError(local);
  let handle;
  try {
    const body = await readJsonBody(request, 16 * 1_024);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      throw new ApiInputError("invalid_project_request");
    }
    const input = body as Record<string, unknown>;
    if (
      typeof input.name !== "string" ||
      (input.description !== undefined && typeof input.description !== "string")
    ) {
      throw new ApiInputError("invalid_project_request");
    }
    handle = openLocalDatabase();
    const project = new ProjectRepository(handle.database).createProject({
      name: input.name,
      ...(typeof input.description === "string"
        ? { description: input.description }
        : {}),
    });
    return noStoreJson({ project: projectDto(project) }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiInputError) return apiError(error.code, error.status);
    if (error instanceof Error && error.message.startsWith("Invalid ")) {
      return apiError("invalid_project_request", 400);
    }
    return apiError("local_data_unavailable", 503);
  } finally {
    handle?.close();
  }
}
