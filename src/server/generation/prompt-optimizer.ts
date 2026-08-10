import type { DmxApiClient } from "../providers/dmxapi/client";

export async function optimizeImagePrompt(client: Pick<DmxApiClient, "complete">, draft: string): Promise<string> {
  const prompt = draft.normalize("NFC").trim();
  if (!prompt || prompt.length > 16_000) throw new Error("invalid_prompt_optimization_request");
  const result = await client.complete({
    model: "gemini-3.6-flash",
    messages: [
      { role: "system", content: "你是 GPT Image 2 提示词编辑器。把用户草稿改写成可直接用于参考图编辑的中文提示词：先说明必须保留的主体身份、构图和关键细节，再精确描述要添加或改变的视觉效果、材质、光线、色彩、镜头与空间关系，最后列出禁止改变的内容。不要堆砌空泛形容词，不要解释，只输出最终提示词。" },
      { role: "user", content: prompt },
    ],
    maxTokens: 1_200,
  });
  if (!result.text.trim()) throw new Error("invalid_provider_response");
  return result.text.trim();
}
