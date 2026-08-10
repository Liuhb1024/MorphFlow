const MAX_EDGE = 2_048;
const ALIGNMENT = 16;

function gcd(left: number, right: number): number {
  let a = Math.abs(Math.round(left));
  let b = Math.abs(Math.round(right));
  while (b > 0) [a, b] = [b, a % b];
  return a || 1;
}

export function sourceAspectLabel(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "未知";
  const divisor = gcd(width, height);
  const exactWidth = Math.round(width) / divisor;
  const exactHeight = Math.round(height) / divisor;
  if (exactWidth <= 32 && exactHeight <= 32) return `${exactWidth}:${exactHeight}`;
  return `${(width / height).toFixed(2)}:1`;
}

export function matchedImageSize(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "auto";
  const ratio = width / height;
  if (ratio > 3 || ratio < 1 / 3) return "auto";
  const longEdge = MAX_EDGE;
  const shortEdge = Math.max(ALIGNMENT, Math.round((longEdge / Math.max(ratio, 1 / ratio)) / ALIGNMENT) * ALIGNMENT);
  return width >= height ? `${longEdge}x${shortEdge}` : `${shortEdge}x${longEdge}`;
}
