import { assetDto } from "@/server/dal/projects";
import { apiError, localBoundaryError, noStoreJson } from "@/server/http/api-response";
import { validateLocalApiRequest } from "@/server/http/local-request";
import { storeLocalAsset } from "@/server/media/local-store";
import {
  ASSET_KINDS,
  ProjectRepository,
  type AssetKind,
} from "@/server/projects/repository";
import { openLocalDatabase } from "@/server/runtime/local-database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_MULTIPART_REQUEST_BYTES = 100 * 1_024 * 1_024;

type RouteContext = Readonly<{
  params: Promise<Readonly<{ projectId: string }>>;
}>;

function isAssetKind(value: string): value is AssetKind {
  return (ASSET_KINDS as readonly string[]).includes(value);
}

function isFile(value: FormDataEntryValue | null): value is File {
  return (
    value !== null &&
    typeof value !== "string" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.size === "number" &&
    typeof value.stream === "function"
  );
}

export async function GET(request: Request, context: RouteContext) {
  const local = validateLocalApiRequest(request, { mutation: false });
  if (!local.ok) return localBoundaryError(local);
  let handle;
  try {
    const { projectId } = await context.params;
    handle = openLocalDatabase();
    const assets = new ProjectRepository(handle.database)
      .listAssets(projectId)
      .map(assetDto);
    return noStoreJson({ assets });
  } catch (error) {
    if (error instanceof Error && error.message === "Project not found") {
      return apiError("project_not_found", 404);
    }
    if (error instanceof Error && error.message.startsWith("Invalid project")) {
      return apiError("invalid_project_id", 400);
    }
    return apiError("local_data_unavailable", 503);
  } finally {
    handle?.close();
  }
}

export async function POST(request: Request, context: RouteContext) {
  const local = validateLocalApiRequest(request, { mutation: true });
  if (!local.ok) return localBoundaryError(local);
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("multipart/form-data;")) {
    return apiError("multipart_form_data_required", 415);
  }
  const contentLength = Number(request.headers.get("content-length"));
  if (
    !Number.isSafeInteger(contentLength) ||
    contentLength <= 0 ||
    contentLength > MAX_MULTIPART_REQUEST_BYTES
  ) {
    return apiError("upload_request_size_invalid", 413);
  }

  let handle;
  try {
    const { projectId } = await context.params;
    const form = await request.formData();
    const file = form.get("file");
    const kind = form.get("kind");
    const shotId = form.get("shotId");
    if (
      !isFile(file) ||
      typeof kind !== "string" ||
      !isAssetKind(kind) ||
      (shotId !== null && typeof shotId !== "string") ||
      file.size <= 0 ||
      file.size > MAX_MULTIPART_REQUEST_BYTES
    ) {
      return apiError("invalid_upload_request", 400);
    }

    handle = openLocalDatabase();
    const asset = await storeLocalAsset({
      database: handle.database,
      dataRoot: handle.paths.root,
      projectId,
      ...(typeof shotId === "string" && shotId.length > 0 ? { shotId } : {}),
      kind,
      originalFilename: file.name,
      declaredMime: file.type,
      stream: file.stream(),
      maxBytes: Math.min(MAX_MULTIPART_REQUEST_BYTES, file.size),
    });
    return noStoreJson({ asset: assetDto(asset) }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Project not found") {
      return apiError("project_not_found", 404);
    }
    if (
      error instanceof Error &&
      (error.message.startsWith("Invalid ") ||
        error.message.includes("upload") ||
        error.message.includes("media type") ||
        error.message.includes("MIME") ||
        error.message.includes("signature") ||
        error.message.includes("filename"))
    ) {
      return apiError("invalid_upload_request", 400);
    }
    return apiError("asset_storage_failed", 500);
  } finally {
    handle?.close();
  }
}
