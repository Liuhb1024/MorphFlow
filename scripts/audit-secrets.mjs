import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";

const MAX_SCANNED_BYTES = 2 * 1024 * 1024;
const binaryExtensions = new Set([
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp3",
  ".mp4",
  ".pdf",
  ".png",
  ".sqlite",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
]);

const rules = [
  { name: "OpenAI-style secret", pattern: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: "Google API key", pattern: /AIza[0-9A-Za-z_-]{30,}/g },
  { name: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/g },
  {
    name: "Bearer token",
    pattern: /Bearer\s+(?!\$|<|\{|\[)[A-Za-z0-9._~-]{24,}/g,
  },
  {
    name: "AWS signed URL",
    pattern: /X-Amz-(?:Credential|Signature)=[A-Fa-f0-9%/]{16,}/g,
  },
];

const trackedFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
    encoding: "utf8",
  },
)
  .split("\0")
  .filter(Boolean);

const findings = [];
let scannedFiles = 0;

for (const file of trackedFiles) {
  // `git ls-files --cached` includes paths deleted in the working tree until
  // they are staged. Pre-commit audits must inspect the real tree without
  // crashing or requiring an early commit just to hide those deletions.
  if (!existsSync(file)) continue;
  if (binaryExtensions.has(extname(file).toLowerCase())) continue;
  if (statSync(file).size > MAX_SCANNED_BYTES) continue;

  const content = readFileSync(file, "utf8");
  scannedFiles += 1;
  const lines = content.split(/\r?\n/);

  for (const [lineIndex, line] of lines.entries()) {
    for (const rule of rules) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(line)) {
        findings.push(`${file}:${lineIndex + 1} ${rule.name}`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secrets found (values intentionally hidden):");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(`Secret audit passed for ${scannedFiles} repository text files.`);
}
