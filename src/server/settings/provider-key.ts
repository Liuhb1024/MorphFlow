import type { SecretStore } from "../secrets/keychain";
import {
  ApiInputError,
  apiError,
  localBoundaryError,
  noStoreJson,
  readJsonBody,
} from "../http/api-response";
import { validateLocalApiRequest } from "../http/local-request";

const PROVIDER = "dmxapi";
const MAX_KEY_REQUEST_BYTES = 20 * 1_024;

function boundary(request: Request, mutation: boolean) {
  return validateLocalApiRequest(request, { mutation });
}

export function createProviderKeyHandlers(store: SecretStore) {
  return {
    async GET(request: Request): Promise<Response> {
      const local = boundary(request, false);
      if (!local.ok) return localBoundaryError(local);
      try {
        return noStoreJson(await store.status(PROVIDER));
      } catch {
        return apiError("credential_store_unavailable", 503);
      }
    },

    async PUT(request: Request): Promise<Response> {
      const local = boundary(request, true);
      if (!local.ok) return localBoundaryError(local);
      try {
        const body = await readJsonBody(request, MAX_KEY_REQUEST_BYTES);
        if (
          typeof body !== "object" ||
          body === null ||
          Array.isArray(body) ||
          typeof (body as Record<string, unknown>).key !== "string"
        ) {
          throw new ApiInputError("invalid_credential_request");
        }
        await store.set(PROVIDER, (body as { key: string }).key);
        return noStoreJson(await store.status(PROVIDER));
      } catch (error) {
        if (error instanceof ApiInputError) {
          return apiError(error.code, error.status);
        }
        return apiError("credential_store_unavailable", 503);
      }
    },

    async DELETE(request: Request): Promise<Response> {
      const local = boundary(request, true);
      if (!local.ok) return localBoundaryError(local);
      try {
        const status = await store.status(PROVIDER);
        if (status.configured) await store.delete(PROVIDER);
        return noStoreJson({ configured: false });
      } catch {
        return apiError("credential_store_unavailable", 503);
      }
    },
  };
}
