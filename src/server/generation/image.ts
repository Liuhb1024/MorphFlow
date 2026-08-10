import { readFile } from "node:fs/promises";

import type Database from "better-sqlite3";

import type { DmxApiClient } from "../providers/dmxapi/client";
import { resolveAssetFile, storeLocalAsset } from "../media/local-store";
import { ProjectRepository, type Asset } from "../projects/repository";

const OUTPUT_MIME = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
} as const;
const QUALITIES = new Set(["low", "medium", "high", "auto"]);
const BACKGROUNDS = new Set(["auto", "opaque"]);

export function validImageSize(size: string): boolean {
  if (size === "auto") return true;
  const match = /^(\d{2,4})x(\d{2,4})$/.exec(size);
  if (!match) return false;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const pixels = width * height;
  const ratio = Math.max(width / height, height / width);
  return width <= 3_840 && height <= 3_840
    && width % 16 === 0 && height % 16 === 0
    && ratio <= 3
    && pixels >= 655_360 && pixels <= 8_294_400;
}

export type GenerateImageInput = Readonly<{
  database: Database.Database;
  dataRoot: string;
  client: Pick<DmxApiClient, "postForm">;
  projectId: string;
  referenceAssetIds: readonly string[];
  prompt: string;
  size: string;
  quality: string;
  background: string;
  outputFormat: keyof typeof OUTPUT_MIME;
}>;

function cleanProviderImage(value: unknown): { bytes?: Buffer; url?: string } {
  if (typeof value !== "object" || value === null) throw new Error("invalid_provider_response");
  const data = (value as Record<string, unknown>).data;
  if (!Array.isArray(data) || typeof data[0] !== "object" || data[0] === null) {
    throw new Error("invalid_provider_response");
  }
  const item = data[0] as Record<string, unknown>;
  if (typeof item.b64_json === "string" && item.b64_json.length > 0) {
    return { bytes: Buffer.from(item.b64_json, "base64") };
  }
  if (typeof item.url === "string") {
    const url = new URL(item.url);
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new Error("invalid_provider_response");
    }
    return { url: url.toString() };
  }
  throw new Error("invalid_provider_response");
}

async function boundedDownload(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok || !response.body) throw new Error("provider_result_download_failed");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > 25 * 1_024 * 1_024) throw new Error("provider_result_too_large");
      chunks.push(Buffer.from(part.value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

async function* oneChunk(bytes: Buffer) {
  yield Uint8Array.from(bytes);
}

export async function generateEditedImage(input: GenerateImageInput): Promise<Asset> {
  const repository = new ProjectRepository(input.database);
  repository.getProject(input.projectId);
  const prompt = input.prompt.normalize("NFC").trim();
  if (!prompt || prompt.length > 32_000 || input.referenceAssetIds.length < 1 || input.referenceAssetIds.length > 10 || !validImageSize(input.size) || !QUALITIES.has(input.quality) || !BACKGROUNDS.has(input.background)) {
    throw new Error("invalid_image_generation_request");
  }
  const references = input.referenceAssetIds.map((id) => repository.getAsset(id));
  if (references.some((asset) => asset.projectId !== input.projectId || !asset.mimeType.startsWith("image/"))) {
    throw new Error("invalid_image_generation_request");
  }
  const form = new FormData();
  form.set("model", "gpt-image-2-03");
  form.set("prompt", prompt);
  form.set("size", input.size);
  form.set("background", input.background);
  form.set("quality", input.quality);
  form.set("output_format", input.outputFormat);
  form.set("n", "1");
  for (const asset of references) {
    const bytes = await readFile(resolveAssetFile(input.dataRoot, asset));
    form.append("image", new Blob([bytes], { type: asset.mimeType }), asset.displayName);
  }
  const response = await input.client.postForm("/v1/images/edits", form, {
    authorization: "bearer",
    timeoutMs: 300_000,
    maxResponseBytes: 40 * 1_024 * 1_024,
  });
  const providerImage = cleanProviderImage(response);
  const bytes = providerImage.bytes ?? await boundedDownload(providerImage.url!);
  const extension = input.outputFormat === "jpeg" ? "jpg" : input.outputFormat;
  return storeLocalAsset({
    database: input.database,
    dataRoot: input.dataRoot,
    projectId: input.projectId,
    kind: "generated_image",
    source: "image_generation",
    originalFilename: `gpt-image-${Date.now()}.${extension}`,
    declaredMime: OUTPUT_MIME[input.outputFormat],
    stream: oneChunk(bytes),
  });
}
