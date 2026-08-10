import { describe, expect, it } from "vitest";

import { matchedImageSize } from "./image-aspect";

describe("matchedImageSize", () => {
  it.each([
    [3840, 2160, "2048x1152"],
    [2160, 3840, "1152x2048"],
    [1600, 1200, "2048x1536"],
    [1200, 1200, "2048x2048"],
  ])("preserves the source ratio within GPT Image constraints", (width, height, expected) => {
    expect(matchedImageSize(width, height)).toBe(expected);
  });

  it("falls back to auto for unknown or unsupported source ratios", () => {
    expect(matchedImageSize(0, 0)).toBe("auto");
    expect(matchedImageSize(4000, 1000)).toBe("auto");
  });
});
