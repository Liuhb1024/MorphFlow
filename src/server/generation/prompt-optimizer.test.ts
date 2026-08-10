import { describe, expect, it, vi } from "vitest";

import { optimizeImagePrompt } from "./prompt-optimizer";

describe("optimizeImagePrompt", () => {
  it("uses the configured director model and returns only the optimized prompt", async () => {
    const complete = vi.fn().mockResolvedValue({ text: "保留人物身份；加入蓝色能量；禁止改变面部。" });
    const result = await optimizeImagePrompt({ complete }, "做得炫酷一点");
    expect(result).toBe("保留人物身份；加入蓝色能量；禁止改变面部。");
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ model: "gemini-3.6-flash", maxTokens: 1_200 }));
  });

  it("rejects an empty draft before any paid call", async () => {
    const complete = vi.fn();
    await expect(optimizeImagePrompt({ complete }, "   ")).rejects.toThrow("invalid_prompt_optimization_request");
    expect(complete).not.toHaveBeenCalled();
  });
});
