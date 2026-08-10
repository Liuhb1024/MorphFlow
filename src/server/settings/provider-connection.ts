import type { DmxCompletionRequest, DmxCompletionResult } from "../providers/dmxapi/client";
import { DmxApiError } from "../providers/dmxapi/client";
import { apiError, localBoundaryError, noStoreJson } from "../http/api-response";
import { validateLocalApiRequest } from "../http/local-request";

type CompletionClient = Readonly<{
  complete: (request: DmxCompletionRequest) => Promise<DmxCompletionResult>;
}>;

export function createProviderConnectionTestHandler(client: CompletionClient) {
  return async function POST(request: Request): Promise<Response> {
    const local = validateLocalApiRequest(request, { mutation: true });
    if (!local.ok) return localBoundaryError(local);
    try {
      const result = await client.complete({
        model: "gemini-3.6-flash",
        messages: [{ role: "user", content: "只回复 OK" }],
        maxTokens: 4,
      });
      return noStoreJson({
        ok: true,
        model: result.model ?? "gemini-3.6-flash",
        ...(result.usage?.totalTokens === undefined
          ? {}
          : { totalTokens: result.usage.totalTokens }),
      });
    } catch (error) {
      if (error instanceof DmxApiError) {
        return apiError(error.code, error.status && error.status >= 400 && error.status < 600 ? error.status : 502);
      }
      return apiError("provider_connection_failed", 502);
    }
  };
}
