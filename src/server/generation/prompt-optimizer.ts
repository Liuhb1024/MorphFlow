import { readFile } from "node:fs/promises";

import type Database from "better-sqlite3";

import { resolveAssetFile } from "../media/local-store";
import type { DmxApiClient } from "../providers/dmxapi/client";
import { ProjectRepository } from "../projects/repository";

export function imagePromptSystem(aspectRatio: string): string {
  const ratio = aspectRatio.trim() || "原图";
  return `你是面向 GPT Image 2 参考图编辑的资深视觉提示词导演。先在内部观察按顺序提供的参考图，再把用户草稿重写为一段可直接提交的中文指令。

规则：
1. 明确写出必须保留的主体身份、面部、姿态、服装、关键物件、构图与空间关系；用户没有要求改变的内容必须保留。
2. 只增加用户明确要求的变化，使用可观察、可定位的材质、光线、颜色、强度和前后景关系，不擅自添加人物、文字、标志或新事件。
3. 保持参考图的宽高比 ${ratio}，不得裁切、拉伸或改变主体在画面中的相对位置，除非用户明确要求。
4. 多张参考图用“参考图 1 / 2 …”明确各自用途；必须逐字保留用户引号中的文字。
5. 末尾给出简短的禁止项，排除重复肢体、身份漂移、结构畸变、无关元素与文字乱码。
6. 不要堆砌“杰作、8K、极致”等空泛质量词，不解释你的思路，不使用 Markdown，只输出最终提示词。`;
}

export function videoPromptSystem(
  capabilityId: string,
  options: Readonly<{ audio: boolean; duration: number }>,
): string {
  const endpoint = capabilityId.includes("first-last-frame")
    ? "输入按首帧 A、尾帧 B 排列。用连续的时间阶段说明主体和镜头如何从首帧 A 自然抵达尾帧 B，最后稳定落在尾帧 B；不得突然切镜或凭空替换主体。"
    : "这是图生视频：只描述相对于输入画面发生的变化，不要复述已经确定的外貌与场景细节，避免错误复述造成身份漂移或切镜。";
  const provider = capabilityId.startsWith("kling-")
    ? "按可灵的主体（描述）+ 动作 + 场景变化 + 镜头语言 + 光线/氛围结构组织。"
    : capabilityId.startsWith("vidu-")
      ? "用清晰的主体运动、环境响应与镜头运动组织连续变化。"
      : capabilityId.startsWith("paiwo-")
        ? "使用直白、连续、可执行的主体动作和镜头运动，避免抽象形容词。"
        : "使用直白、连续、可执行的主体动作、环境响应和镜头运动。";
  const audio = options.audio
    ? "如用户明确要求声音，把声音事件写在它实际发生的时间点；不要添加画外解释。"
    : "当前模式未启用音频，不要添加声音、对白、配乐或音效。";
  return `你是 AI 视频生成提示词导演。只描述相对于输入画面发生的变化，不要虚构输入中不存在的既定外观。${endpoint}
${provider}
在 ${options.duration} 秒内按时间顺序写出可拍摄的微动作，动作复杂度必须与时长匹配。使用主动动词、明确方向和客观空间关系；只在用户提出时加入运镜、光线变化或新动作。保持人物身份、服装、物体结构、背景几何与运动方向连续。${audio}
不要解释，不使用 Markdown，只输出一段最终中文视频提示词。`;
}

function parsePromptResponse(response: unknown): string {
  if (typeof response !== "object" || response === null) throw new Error("invalid_provider_response");
  const choices = (response as Record<string, unknown>).choices;
  const first = Array.isArray(choices) ? choices[0] : undefined;
  const message = typeof first === "object" && first !== null ? (first as Record<string, unknown>).message : undefined;
  const text = typeof message === "object" && message !== null ? (message as Record<string, unknown>).content : undefined;
  if (typeof text !== "string" || !text.trim()) throw new Error("invalid_provider_response");
  return text.trim();
}

export async function optimizeImagePrompt(input: Readonly<{
  database: Database.Database;
  dataRoot: string;
  client: Pick<DmxApiClient, "postJson">;
  projectId: string;
  referenceAssetIds: readonly string[];
  draft: string;
  aspectRatio: string;
}>): Promise<string> {
  const prompt = input.draft.normalize("NFC").trim();
  const aspectRatio = input.aspectRatio.normalize("NFC").trim();
  if (!prompt || prompt.length > 16_000 || !/^(?:未知|读取中|\d{1,2}:\d{1,2}|\d{1,2}\.\d{2}:1)$/.test(aspectRatio) || input.referenceAssetIds.length < 1 || input.referenceAssetIds.length > 10) {
    throw new Error("invalid_prompt_optimization_request");
  }
  const repository = new ProjectRepository(input.database);
  repository.getProject(input.projectId);
  const assets = input.referenceAssetIds.map((id) => repository.getAsset(id));
  if (assets.some((asset) => asset.projectId !== input.projectId || !asset.mimeType.startsWith("image/"))) {
    throw new Error("invalid_prompt_optimization_request");
  }
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: `${imagePromptSystem(aspectRatio)}\n\n用户原始意图：${prompt}` },
  ];
  for (const asset of assets) {
    const bytes = await readFile(resolveAssetFile(input.dataRoot, asset));
    content.push({ type: "image_url", image_url: { url: `data:${asset.mimeType};base64,${bytes.toString("base64")}` } });
  }
  const response = await input.client.postJson("/v1/chat/completions", {
    model: "gemini-3.6-flash",
    messages: [{ role: "user", content }],
    temperature: 0.1,
    max_tokens: 1_600,
    stream: false,
  }, { authorization: "bare", timeoutMs: 180_000, maxResponseBytes: 2 * 1_024 * 1_024 });
  return parsePromptResponse(response);
}
