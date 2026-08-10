import type { SecretStore } from "../../secrets/keychain";

export const DMX_CHAT_COMPLETIONS_URL =
  "https://www.dmxapi.cn/v1/chat/completions";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1_024;
const MAX_PROMPT_CHARS = 64 * 1_024;

type ChatRole = "system" | "user" | "assistant";

export type DmxChatMessage = Readonly<{
  role: ChatRole;
  content: string;
}>;

export type DmxCompletionRequest = Readonly<{
  model: string;
  messages: readonly DmxChatMessage[];
  maxTokens: number;
}>;

export type DmxCompletionResult = Readonly<{
  text: string;
  model?: string;
  usage?: Readonly<{
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  }>;
}>;

export type DmxApiErrorCode =
  | "credential_unavailable"
  | "invalid_request"
  | "network_error"
  | "request_timeout"
  | "provider_http_error"
  | "response_too_large"
  | "invalid_provider_response";

export class DmxApiError extends Error {
  readonly code: DmxApiErrorCode;
  readonly status: number | undefined;
  readonly detail: string | undefined;

  constructor(code: DmxApiErrorCode, status?: number, detail?: string) {
    super(code);
    this.name = "DmxApiError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

type FetchLike = typeof fetch;

type DmxApiClientOptions = Readonly<{
  secretStore: SecretStore;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxResponseBytes?: number;
}>;

export type DmxAuthorizationStyle = "bare" | "bearer";

export type DmxRawRequestOptions = Readonly<{
  authorization: DmxAuthorizationStyle;
  timeoutMs?: number;
  maxResponseBytes?: number;
}>;

function validateRequest(request: DmxCompletionRequest): void {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(request.model)) {
    throw new DmxApiError("invalid_request");
  }
  if (
    request.messages.length === 0 ||
    !Number.isSafeInteger(request.maxTokens) ||
    request.maxTokens < 1 ||
    request.maxTokens > 8_192
  ) {
    throw new DmxApiError("invalid_request");
  }
  const promptChars = request.messages.reduce((total, message) => {
    if (!message.content || message.content.length > MAX_PROMPT_CHARS) {
      throw new DmxApiError("invalid_request");
    }
    return total + message.content.length;
  }, 0);
  if (promptChars > MAX_PROMPT_CHARS) {
    throw new DmxApiError("invalid_request");
  }
}

async function readBoundedText(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new DmxApiError("response_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(
    "utf8",
  );
}

function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sanitizeProviderText(value: string, credential: string): string | undefined {
  const redacted = value
    .replaceAll(credential, "[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi, "Bearer [REDACTED]")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return redacted.length > 0 ? redacted : undefined;
}

function providerErrorDetail(raw: string, credential: string): string | undefined {
  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    const error = typeof body.error === "object" && body.error !== null
      ? body.error as Record<string, unknown>
      : undefined;
    const message = typeof error?.message === "string"
      ? error.message
      : typeof body.message === "string"
        ? body.message
        : typeof body.error === "string"
          ? body.error
          : undefined;
    if (!message) return undefined;
    const code = typeof error?.code === "string" ? error.code : undefined;
    return sanitizeProviderText(code ? `${code}: ${message}` : message, credential);
  } catch {
    return undefined;
  }
}

function parseResponse(raw: string): DmxCompletionResult {
  try {
    const body = JSON.parse(raw) as Record<string, unknown>;
    const choices = body.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new DmxApiError("invalid_provider_response");
    }
    const first = choices[0] as Record<string, unknown>;
    const message = first.message as Record<string, unknown> | undefined;
    if (!message || typeof message.content !== "string") {
      throw new DmxApiError("invalid_provider_response");
    }
    const usage = body.usage as Record<string, unknown> | undefined;
    const promptTokens = optionalFiniteNumber(usage?.prompt_tokens);
    const completionTokens = optionalFiniteNumber(usage?.completion_tokens);
    const totalTokens = optionalFiniteNumber(usage?.total_tokens);
    const parsedUsage = usage
      ? {
          ...(promptTokens === undefined ? {} : { promptTokens }),
          ...(completionTokens === undefined ? {} : { completionTokens }),
          ...(totalTokens === undefined ? {} : { totalTokens }),
        }
      : undefined;
    return {
      text: message.content,
      ...(typeof body.model === "string" ? { model: body.model } : {}),
      ...(parsedUsage ? { usage: parsedUsage } : {}),
    };
  } catch (error) {
    if (error instanceof DmxApiError) throw error;
    throw new DmxApiError("invalid_provider_response");
  }
}

export class DmxApiClient {
  private readonly secretStore: SecretStore;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(options: DmxApiClientOptions) {
    this.secretStore = options.secretStore;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxResponseBytes =
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  }

  private async post(
    url: string,
    body: BodyInit,
    headers: HeadersInit,
    options: DmxRawRequestOptions,
  ): Promise<string> {
    let credential: string;
    try {
      credential = await this.secretStore.get("dmxapi");
    } catch {
      throw new DmxApiError("credential_unavailable");
    }
    const signal = AbortSignal.timeout(options.timeoutMs ?? this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            ...headers,
            Authorization: options.authorization === "bearer"
              ? `Bearer ${credential}`
              : credential,
          },
          body,
          redirect: "error",
          signal,
        });
      } catch {
        if (signal.aborted) throw new DmxApiError("request_timeout");
        throw new DmxApiError("network_error");
      }
      const raw = await readBoundedText(
        response,
        options.maxResponseBytes ?? this.maxResponseBytes,
      );
      if (!response.ok) {
        throw new DmxApiError(
          "provider_http_error",
          response.status,
          providerErrorDetail(raw, credential),
        );
      }
      return raw;
    } finally {
      credential = "";
    }
  }

  async postJson(
    path: "/v1/responses" | "/v1/chat/completions",
    payload: Readonly<Record<string, unknown>>,
    options: DmxRawRequestOptions,
  ): Promise<unknown> {
    const raw = await this.post(
      `https://www.dmxapi.cn${path}`,
      JSON.stringify(payload),
      { "Content-Type": "application/json" },
      options,
    );
    try {
      return JSON.parse(raw);
    } catch {
      throw new DmxApiError("invalid_provider_response");
    }
  }

  async postForm(
    path: "/v1/images/edits",
    form: FormData,
    options: DmxRawRequestOptions,
  ): Promise<unknown> {
    const raw = await this.post(
      `https://www.dmxapi.cn${path}`,
      form,
      {},
      options,
    );
    try {
      return JSON.parse(raw);
    } catch {
      throw new DmxApiError("invalid_provider_response");
    }
  }

  async complete(request: DmxCompletionRequest): Promise<DmxCompletionResult> {
    validateRequest(request);
    const raw = await this.post(
      DMX_CHAT_COMPLETIONS_URL,
      JSON.stringify({
        model: request.model,
        messages: request.messages,
        temperature: 0,
        max_tokens: request.maxTokens,
        stream: false,
      }),
      { "Content-Type": "application/json" },
      { authorization: "bare" },
    );
    return parseResponse(raw);
  }
}
