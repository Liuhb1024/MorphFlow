import { readFile } from "node:fs/promises";

import type Database from "better-sqlite3";

import {
  estimateCapabilityCost,
  getCapability,
  normalizeCapabilityDraft,
  validateCapabilityDraft,
  validateInputBindings,
} from "@/model-registry/registry";
import type { ParameterValue } from "@/model-registry/types";

import { resolveAssetFile, storeLocalAsset } from "../media/local-store";
import { ProjectRepository, type Asset } from "../projects/repository";
import type { DmxApiClient } from "../providers/dmxapi/client";
import { VideoTaskRepository, type VideoTask, type VideoTaskStatus } from "./video-tasks";

type Bindings = Readonly<Record<string, readonly string[]>>;
type Values = Readonly<Record<string, ParameterValue>>;

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function nested(value: unknown): unknown[] {
  const found: unknown[] = [value];
  const record = object(value);
  if (!record) return found;
  const output = Array.isArray(record.output) ? object(record.output[0]) : undefined;
  const content = output && Array.isArray(output.content) ? object(output.content[0]) : undefined;
  if (typeof content?.text === "string") {
    try { found.push(JSON.parse(content.text)); } catch { /* provider text is not JSON */ }
  }
  if (record.Resp) found.push(record.Resp);
  if (record.task) found.push(record.task);
  return found;
}

function firstString(values: unknown[], keys: readonly string[]): string | undefined {
  for (const value of values) {
    const record = object(value);
    if (!record) continue;
    for (const key of keys) {
      const candidate = record[key];
      if ((typeof candidate === "string" || typeof candidate === "number") && String(candidate).length > 0) return String(candidate);
    }
  }
}

function taskId(response: unknown): string {
  const id = firstString(nested(response), ["task_id", "taskId", "video_id", "img_id"]);
  if (!id || id.length > 256) throw new Error("invalid_provider_response");
  return id;
}

async function assetData(asset: Asset, dataRoot: string, raw = false): Promise<string> {
  const bytes = await readFile(resolveAssetFile(dataRoot, asset));
  const encoded = bytes.toString("base64");
  return raw ? encoded : `data:${asset.mimeType};base64,${encoded}`;
}

function boundAssets(repository: ProjectRepository, projectId: string, bindings: Bindings): Record<string, Asset[]> {
  return Object.fromEntries(Object.entries(bindings).map(([slot, ids]) => [slot, ids.map((id) => {
    const asset = repository.getAsset(id);
    if (asset.projectId !== projectId) throw new Error("invalid_video_generation_request");
    return asset;
  })]));
}

async function buildPayload(capabilityId: string, values: Values, assets: Record<string, Asset[]>, dataRoot: string, client: Pick<DmxApiClient, "postJson">): Promise<Record<string, unknown>> {
  const capability = getCapability(capabilityId);
  const prompt = String(values.prompt ?? "");
  const first = assets.firstFrame?.[0];
  const last = assets.lastFrame?.[0];

  if (capability.modelId === "kling-v3") {
    const multi = capability.modeId === "text-multi-shot" || capability.modeId === "image-multi-shot";
    if (multi && values.shotType === "intelligence" && !prompt.trim()) throw new Error("invalid_video_generation_request");
    const shots = Array.isArray(values.shots) ? values.shots.map((shot, index) => ({ index: index + 1, prompt: shot.prompt, duration: String(shot.duration) })) : [];
    return {
      model: capability.modelId,
      input: multi && values.shotType === "customize" ? shots : prompt,
      multi_shot: multi,
      ...(multi ? { shot_type: values.shotType } : {}),
      ...(multi && capability.modeId === "text-multi-shot" && values.shotType === "customize" ? { multi_prompt: shots } : {}),
      ...(first ? { image: await assetData(first, dataRoot, true) } : {}),
      ...(last ? { image_tail: await assetData(last, dataRoot, true) } : {}),
      negative_prompt: String(values.negativePrompt ?? ""), duration: String(values.duration),
      mode: values.modelMode, sound: values.audio ? "on" : "off", cfg_scale: values.cfgScale,
      watermark_info: { enabled: Boolean(values.watermark) },
      ...(values.ratio ? { aspect_ratio: values.ratio } : {}),
    };
  }
  if (capability.modelId.startsWith("happyhorse-")) {
    const references = capability.modeId === "reference-to-video" ? assets.referenceImages ?? [] : first ? [first] : [];
    return {
      model: capability.modelId,
      input: { prompt, media: await Promise.all(references.map(async (asset) => ({ type: capability.modeId === "reference-to-video" ? "reference_image" : "first_frame", url: await assetData(asset, dataRoot) }))) },
      parameters: { resolution: values.resolution, duration: values.duration, watermark: values.watermark, ...(values.ratio ? { ratio: values.ratio } : {}), ...(typeof values.seed === "number" ? { seed: values.seed } : {}) },
    };
  }
  if (capability.modelId === "viduq3-pro") {
    const frames = [first, last].filter((asset): asset is Asset => Boolean(asset));
    const encoded = await Promise.all(frames.map((asset) => assetData(asset, dataRoot)));
    return capability.modeId === "first-last-frame"
      ? { model: capability.modelId, input: encoded, prompt, is_rec: values.recommendedPrompt, duration: values.duration, seed: values.seed, resolution: values.resolution, audio: values.audio, watermark: values.watermark, wm_position: values.watermarkPosition }
      : { model: capability.modelId, images: encoded, input: prompt, is_rec: values.recommendedPrompt, duration: values.duration, seed: values.seed, resolution: values.resolution, audio: values.audio, watermark: values.watermark, wm_position: values.watermarkPosition };
  }
  if (capability.modelId === "MiniMax-H3") {
    const input: Record<string, unknown>[] = [{ type: "text", text: prompt }];
    const add = async (items: Asset[], type: "image_url" | "video_url" | "audio_url", role: string) => {
      for (const asset of items) input.push({ type, [type]: { url: await assetData(asset, dataRoot) }, role });
    };
    await add(assets.firstFrame ?? [], "image_url", "first_frame");
    await add(assets.lastFrame ?? [], "image_url", "last_frame");
    await add(assets.referenceImages ?? [], "image_url", "reference_image");
    await add(assets.referenceVideos ?? [], "video_url", "reference_video");
    await add(assets.referenceAudios ?? [], "audio_url", "reference_audio");
    return { model: capability.modelId, input, resolution: values.resolution, duration: values.duration, ratio: values.ratio, aigc_watermark: values.watermark };
  }
  if (capability.modelId.startsWith("paiwo-v5.6-")) {
    const upload = async (asset: Asset) => taskId(await client.postJson("/v1/responses", { model: "paiwo-picture", input: await assetData(asset, dataRoot, true) }, { authorization: "bearer", timeoutMs: 120_000, maxResponseBytes: 2 * 1_024 * 1_024 }));
    const firstId = first ? await upload(first) : undefined;
    const lastId = last ? await upload(last) : undefined;
    return { model: capability.modelId, input: prompt, duration: values.duration, quality: values.resolution, motion_mode: values.motionMode, generate_audio_switch: values.audio, ...(typeof values.seed === "number" ? { seed: values.seed } : {}), ...(capability.modeId === "first-last-frame" ? { first_frame_img: Number(firstId), last_frame_img: Number(lastId) } : { img_id: Number(firstId), negative_prompt: String(values.negativePrompt ?? "") }) };
  }
  throw new Error("unsupported_video_capability");
}

function queryModel(modelId: string): string {
  if (modelId === "kling-v3") return "kling-v3-get-all";
  if (modelId.startsWith("happyhorse-")) return "happyhorse-get";
  if (modelId === "viduq3-pro") return "vidu-get";
  if (modelId === "MiniMax-H3") return "MiniMax-H3-get";
  if (modelId.startsWith("paiwo-v5.6-")) return "paiwo-get";
  throw new Error("unsupported_video_capability");
}

function queryResult(response: unknown): { status: VideoTaskStatus; url?: string; errorCode?: string } {
  const variants = nested(response);
  const statusRaw = (firstString(variants, ["task_status", "status", "state"]) ?? "unknown").toLowerCase();
  let status: VideoTaskStatus = ["pending", "created", "queued"].includes(statusRaw) ? "submitted" : ["running", "processing"].includes(statusRaw) ? "running" : ["succeeded", "success", "5"].includes(statusRaw) ? "succeeded" : ["failed", "cancelled", "canceled"].includes(statusRaw) ? "failed" : "unknown";
  let url = firstString(variants, ["video_url", "url"]);
  for (const value of variants) {
    const record = object(value);
    const data = object(record?.data);
    const result = object(data?.task_result);
    const videos = Array.isArray(result?.videos) ? result.videos : [];
    const firstVideo = object(videos[0]);
    url ??= typeof firstVideo?.url === "string" ? firstVideo.url : undefined;
    const content = object(record?.content);
    url ??= typeof content?.url === "string" ? content.url : undefined;
  }
  if (url) status = "succeeded";
  return { status, ...(url ? { url } : {}), ...(status === "failed" ? { errorCode: "provider_task_failed" } : {}) };
}

async function downloadVideo(url: string): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("invalid_provider_response");
  const response = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(300_000) });
  if (!response.ok || !response.body) throw new Error("provider_result_download_failed");
  const reader = response.body.getReader(); const chunks: Buffer[] = []; let total = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total > 1024 * 1024 * 1024) throw new Error("provider_result_too_large"); chunks.push(Buffer.from(part.value)); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}

async function* oneChunk(bytes: Buffer) { yield Uint8Array.from(bytes); }

export async function submitVideoTask(input: { database: Database.Database; dataRoot: string; client: Pick<DmxApiClient, "postJson">; projectId: string; capabilityId: string; values: Readonly<Record<string, unknown>>; bindings: Bindings }): Promise<VideoTask> {
  const capability = getCapability(input.capabilityId);
  if (capability.category !== "video" || capability.modeId === "subject-control") throw new Error("unsupported_video_capability");
  const values = normalizeCapabilityDraft(input.capabilityId, input.values);
  if (capability.modelId === "kling-v3" && ["text-multi-shot", "image-multi-shot"].includes(capability.modeId) && values.shotType === "intelligence" && !String(values.prompt ?? "").trim()) throw new Error("invalid_video_generation_request");
  const valueCheck = validateCapabilityDraft(input.capabilityId, values);
  const bindingCheck = validateInputBindings(input.capabilityId, input.bindings);
  if (!valueCheck.valid || !bindingCheck.valid) throw new Error("invalid_video_generation_request");
  const projects = new ProjectRepository(input.database); projects.getProject(input.projectId);
  const assets = boundAssets(projects, input.projectId, input.bindings);
  const estimate = estimateCapabilityCost(input.capabilityId, values);
  const tasks = new VideoTaskRepository(input.database);
  const task = tasks.create({ projectId: input.projectId, capabilityId: input.capabilityId, modelId: capability.modelId, request: { values, bindings: input.bindings }, estimatedCostCny: estimate.kind === "exact" ? estimate.amount : null });
  try {
    const payload = await buildPayload(input.capabilityId, values, assets, input.dataRoot, input.client);
    const response = await input.client.postJson("/v1/responses", payload, { authorization: "bare", timeoutMs: 180_000, maxResponseBytes: 4 * 1_024 * 1_024 });
    return tasks.update(task.id, { status: "submitted", providerTaskId: taskId(response), errorCode: null });
  } catch (error) {
    tasks.update(task.id, { status: "unknown", errorCode: error instanceof Error ? error.message.slice(0, 160) : "submission_failed" });
    throw error;
  }
}

export async function pollVideoTask(input: { database: Database.Database; dataRoot: string; client: Pick<DmxApiClient, "postJson">; projectId: string; taskId: string }): Promise<VideoTask> {
  const tasks = new VideoTaskRepository(input.database); const task = tasks.get(input.taskId);
  if (task.projectId !== input.projectId) throw new Error("Video task not found");
  if (task.status === "succeeded" || task.status === "failed") return task;
  if (!task.providerTaskId) throw new Error("video_task_manual_recovery_required");
  const response = await input.client.postJson("/v1/responses", { model: queryModel(task.modelId), input: task.providerTaskId, ...(task.modelId === "viduq3-pro" ? { stream: false } : {}) }, { authorization: "bare", timeoutMs: 180_000, maxResponseBytes: 4 * 1_024 * 1_024 });
  const result = queryResult(response);
  if (result.status !== "succeeded" || !result.url) return tasks.update(task.id, { status: result.status, errorCode: result.errorCode ?? null });
  const bytes = await downloadVideo(result.url);
  const asset = await storeLocalAsset({ database: input.database, dataRoot: input.dataRoot, projectId: input.projectId, kind: "generated_video", source: "video_generation", originalFilename: `generated-${task.id}.mp4`, declaredMime: "video/mp4", stream: oneChunk(bytes) });
  return tasks.update(task.id, { status: "succeeded", resultAssetId: asset.id, errorCode: null });
}
