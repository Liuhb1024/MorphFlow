import { readFile } from "node:fs/promises";

import type Database from "better-sqlite3";

import type { DmxApiClient } from "../providers/dmxapi/client";
import { resolveAssetFile } from "../media/local-store";
import { ProjectRepository } from "../projects/repository";

export async function generateDirectorAdvice(input: {
  database: Database.Database;
  dataRoot: string;
  client: Pick<DmxApiClient, "postJson">;
  projectId: string;
  assetIds: readonly string[];
  prompt: string;
}): Promise<string> {
  const prompt = input.prompt.normalize("NFC").trim();
  if (!prompt || prompt.length > 32_000 || input.assetIds.length > 8) throw new Error("invalid_director_request");
  const repository = new ProjectRepository(input.database);
  repository.getProject(input.projectId);
  const assets = input.assetIds.map((id) => repository.getAsset(id));
  if (assets.some((asset) => asset.projectId !== input.projectId || !asset.mimeType.startsWith("image/"))) throw new Error("invalid_director_request");
  const content: Array<Record<string, unknown>> = [{ type: "text", text: `你是 AI 视频转场导演。根据用户意图和按顺序提供的 A/B/参考画面，输出一段可直接用于视频模型的中文镜头提示词。必须说明主体连续性、镜头运动、节奏、光线变化和禁止变化；不要解释，只输出最终提示词。\n\n用户意图：${prompt}` }];
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
