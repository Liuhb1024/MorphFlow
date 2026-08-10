import { readFile } from "node:fs/promises";

import type Database from "better-sqlite3";

import type { DmxApiClient } from "../providers/dmxapi/client";
import { resolveAssetFile } from "../media/local-store";
import { ProjectRepository } from "../projects/repository";
import { videoPromptSystem } from "./prompt-optimizer";

export async function generateDirectorAdvice(input: {
  database: Database.Database;
  dataRoot: string;
  client: Pick<DmxApiClient, "postJson">;
  projectId: string;
  assetIds: readonly string[];
  prompt: string;
  capabilityId: string;
  duration: number;
  audio: boolean;
}): Promise<string> {
  const prompt = input.prompt.normalize("NFC").trim();
  if (!prompt || prompt.length > 32_000 || input.assetIds.length > 8 || !/^[a-z0-9.-]+:[a-z0-9-]+$/i.test(input.capabilityId) || !Number.isInteger(input.duration) || input.duration < 1 || input.duration > 30) throw new Error("invalid_director_request");
  const repository = new ProjectRepository(input.database);
  repository.getProject(input.projectId);
  const assets = input.assetIds.map((id) => repository.getAsset(id));
  if (assets.some((asset) => asset.projectId !== input.projectId || !asset.mimeType.startsWith("image/"))) throw new Error("invalid_director_request");
  const content: Array<Record<string, unknown>> = [{ type: "text", text: `${videoPromptSystem(input.capabilityId, { audio: input.audio, duration: input.duration })}\n\n用户意图：${prompt}` }];
  for (const asset of assets) {
    const bytes = await readFile(resolveAssetFile(input.dataRoot, asset));
    content.push({ type: "image_url", image_url: { url: `data:${asset.mimeType};base64,${bytes.toString("base64")}` } });
  }
  const response = await input.client.postJson("/v1/chat/completions", {
    model: "gemini-3.6-flash",
    messages: [{ role: "user", content }],
    temperature: 0.2,
    max_tokens: 1600,
    stream: false,
  }, { authorization: "bare", timeoutMs: 180_000, maxResponseBytes: 2 * 1_024 * 1_024 });
  if (typeof response !== "object" || response === null) throw new Error("invalid_provider_response");
  const choices = (response as Record<string, unknown>).choices;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const message = typeof first === "object" && first !== null ? (first as Record<string, unknown>).message : undefined;
  const text = typeof message === "object" && message !== null ? (message as Record<string, unknown>).content : undefined;
  if (typeof text !== "string" || !text.trim()) throw new Error("invalid_provider_response");
  return text.trim();
}
