import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createCapabilityDefaults } from "@/model-registry/registry";

import { openMorphFlowDatabase } from "../db/connection";
import { storeLocalAsset } from "../media/local-store";
import { ProjectRepository } from "../projects/repository";
import { DmxApiError } from "../providers/dmxapi/client";
import { VideoTaskRepository } from "./video-tasks";
import { pollVideoTask, submitVideoTask } from "./video";

const dirs: string[] = [];
const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2]);
const mp4 = Buffer.concat([Buffer.alloc(4), Buffer.from("ftyp"), Buffer.from("isom"), Buffer.alloc(16)]);
async function* bytes() { yield Uint8Array.from(png); }
afterEach(() => { vi.unstubAllGlobals(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "morphflow-video-")); dirs.push(root);
  const database = openMorphFlowDatabase({ filename: join(root, "db.sqlite") });
  const project = new ProjectRepository(database).createProject({ name: "video" });
  const a = await storeLocalAsset({ database, dataRoot: root, projectId: project.id, kind: "first_frame", originalFilename: "a.png", declaredMime: "image/png", stream: bytes() });
  const b = await storeLocalAsset({ database, dataRoot: root, projectId: project.id, kind: "last_frame", originalFilename: "b.png", declaredMime: "image/png", stream: bytes() });
  return { root, database, project, a, b };
}

describe("video generation", () => {
  it("returns field-level validation issues without creating or submitting a paid task", async () => {
    const data = await setup();
    const postJson = vi.fn();
    const capabilityId = "kling-v3:first-last-frame";

    await expect(submitVideoTask({
      database: data.database,
      dataRoot: data.root,
      client: { postJson },
      projectId: data.project.id,
      capabilityId,
      values: { ...createCapabilityDefaults(capabilityId), cfgScale: "" },
      bindings: { firstFrame: [data.a.id], lastFrame: [data.b.id] },
    })).rejects.toMatchObject({
      message: "invalid_video_generation_request",
      issues: expect.arrayContaining([
        expect.objectContaining({ field: "cfgScale", message: "提示词相关性必须是数字。" }),
      ]),
    });
    expect(postJson).not.toHaveBeenCalled();
    data.database.close();
  });

  it("records a definitive provider 400 rejection as failed instead of unknown", async () => {
    const data = await setup();
    const capabilityId = "kling-v3:first-last-frame";
    const postJson = vi.fn().mockRejectedValue(new DmxApiError("provider_http_error", 400, "input is required"));

    await expect(submitVideoTask({
      database: data.database,
      dataRoot: data.root,
      client: { postJson },
      projectId: data.project.id,
      capabilityId,
      values: { ...createCapabilityDefaults(capabilityId), prompt: "连续转场" },
      bindings: { firstFrame: [data.a.id], lastFrame: [data.b.id] },
    })).rejects.toMatchObject({ code: "provider_http_error", status: 400 });

    expect(new VideoTaskRepository(data.database).list(data.project.id)[0]).toMatchObject({
      status: "failed",
      errorCode: "provider_http_error",
    });
    data.database.close();
  });

  it.each([
    ["kling-v3:first-last-frame", { firstFrame: "a", lastFrame: "b" }, { taskId: "kling-1" }],
    ["happyhorse-1.1-i2v:image-to-video", { firstFrame: "a" }, { output: [{ content: [{ text: '{"task_id":"happy-1"}' }] }] }],
    ["viduq3-pro:first-last-frame", { firstFrame: "a", lastFrame: "b" }, { task_id: "vidu-1" }],
    ["MiniMax-H3:first-last-frame", { firstFrame: "a", lastFrame: "b" }, { task_id: "h3-1" }],
  ])("submits %s with persisted provider id", async (capabilityId, slots, response) => {
    const data = await setup();
    const postJson = vi.fn().mockResolvedValue(response);
    const values = { ...createCapabilityDefaults(capabilityId), prompt: "镜头平稳运动" };
    const bindings = Object.fromEntries(Object.entries(slots).map(([slot, id]) => [slot, [(id === "a" ? data.a : data.b).id]]));
    const task = await submitVideoTask({ database: data.database, dataRoot: data.root, client: { postJson }, projectId: data.project.id, capabilityId, values, bindings });
    expect(task.status).toBe("submitted"); expect(task.providerTaskId).toBeTruthy();
    expect(postJson).toHaveBeenCalledWith("/v1/responses", expect.objectContaining({ model: expect.any(String) }), expect.objectContaining({ authorization: "bare" }));
    data.database.close();
  });

  it("uploads Paiwo images first, persists its video id, then downloads a completed result", async () => {
    const data = await setup();
    const postJson = vi.fn()
      .mockResolvedValueOnce({ Resp: { img_id: 101 } })
      .mockResolvedValueOnce({ Resp: { img_id: 102 } })
      .mockResolvedValueOnce({ Resp: { video_id: 999 } })
      .mockResolvedValueOnce({ Resp: { status: 5, url: "https://media.example.test/result.mp4" } });
    const capabilityId = "paiwo-v5.6-itv2:first-last-frame";
    const task = await submitVideoTask({ database: data.database, dataRoot: data.root, client: { postJson }, projectId: data.project.id, capabilityId, values: { ...createCapabilityDefaults(capabilityId), prompt: "一镜到底" }, bindings: { firstFrame: [data.a.id], lastFrame: [data.b.id] } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(mp4, { status: 200, headers: { "Content-Type": "video/mp4" } })));
    const completed = await pollVideoTask({ database: data.database, dataRoot: data.root, client: { postJson }, projectId: data.project.id, taskId: task.id });
    expect(completed.status).toBe("succeeded"); expect(completed.resultAssetId).toBeTruthy();
    expect(new ProjectRepository(data.database).getAsset(completed.resultAssetId!).source).toBe("video_generation");
    data.database.close();
  });
});
