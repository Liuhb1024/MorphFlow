import { createHash, randomUUID } from "node:crypto";
import {
  constants,
  createReadStream,
  fstatSync,
  lstatSync,
  openSync,
  closeSync,
  realpathSync,
} from "node:fs";
import {
  mkdir,
  open,
  rename,
  rm,
  lstat,
  realpath,
} from "node:fs/promises";
import { extname, isAbsolute, posix, relative, resolve } from "node:path";

import type Database from "better-sqlite3";

import {
  ASSET_KINDS,
  ProjectRepository,
  assertResourceId,
  type Asset,
  type AssetKind,
  type AssetSource,
} from "../projects/repository";

const IMAGE_MAX_BYTES = 25 * 1_024 * 1_024;
const VIDEO_MAX_BYTES = 1_024 * 1_024 * 1_024;
const HEADER_BYTES = 32;

const FORMATS = {
  ".jpg": { mime: "image/jpeg", media: "image" },
  ".jpeg": { mime: "image/jpeg", media: "image" },
  ".png": { mime: "image/png", media: "image" },
  ".webp": { mime: "image/webp", media: "image" },
  ".mp4": { mime: "video/mp4", media: "video" },
  ".mov": { mime: "video/quicktime", media: "video" },
} as const;

type AllowedExtension = keyof typeof FORMATS;
type ByteStream = AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;

export type UploadMetadata = Readonly<{
  filename: string;
  declaredMime: string;
  kind: AssetKind;
}>;

export type ValidatedUploadMetadata = Readonly<{
  displayName: string;
  mimeType: string;
  extension: AllowedExtension;
  maxBytes: number;
}>;

export type StoreLocalAssetInput = Readonly<{
  database: Database.Database;
  dataRoot: string;
  projectId: string;
  shotId?: string;
  kind: AssetKind;
  source?: AssetSource;
  originalFilename: string;
  declaredMime: string;
  stream: ByteStream;
  maxBytes?: number;
}>;

type StoreDependencies = Readonly<{
  createId?: () => string;
  now?: () => number;
}>;

function isInside(parent: string, candidate: string): boolean {
  const fromParent = relative(parent, candidate);
  return (
    fromParent === "" ||
    (!fromParent.startsWith("..") && !isAbsolute(fromParent))
  );
}

function cleanDisplayName(filename: string): string {
  const normalized = filename.normalize("NFC").trim();
  if (
    normalized.length === 0 ||
    normalized.length > 120 ||
    normalized.includes("..") ||
    /[\0-\x1f\x7f/\\]/.test(normalized)
  ) {
    throw new Error("Unsafe upload filename");
  }
  return normalized;
}

function isAssetKind(value: string): value is AssetKind {
  return (ASSET_KINDS as readonly string[]).includes(value);
}

export function validateUploadMetadata(
  metadata: UploadMetadata,
): ValidatedUploadMetadata {
  if (!isAssetKind(metadata.kind)) {
    throw new Error("Unsupported asset kind");
  }
  const displayName = cleanDisplayName(metadata.filename);
  const extension = extname(displayName).toLowerCase() as AllowedExtension;
  const format = FORMATS[extension];
  if (!format) {
    throw new Error("Unsupported upload extension");
  }
  const stem = displayName.slice(0, -extension.length);
  const precedingExtension = extname(stem).toLowerCase();
  if (
    precedingExtension in FORMATS ||
    [".exe", ".sh", ".js", ".html", ".php"].includes(precedingExtension)
  ) {
    throw new Error("Unsafe double-extension filename");
  }
  const declaredMime = metadata.declaredMime.trim().toLowerCase();
  if (declaredMime !== format.mime) {
    throw new Error("Declared MIME does not match the file extension");
  }

  const kindMedia =
    metadata.kind === "source_video" || metadata.kind === "generated_video"
      ? "video"
      : "image";
  if (format.media !== kindMedia) {
    throw new Error("Asset kind does not match the media type");
  }
  return {
    displayName,
    mimeType: format.mime,
    extension,
    maxBytes: format.media === "video" ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES,
  };
}

function headerMatches(mimeType: string, header: Uint8Array): boolean {
  const buffer = Buffer.from(header);
  switch (mimeType) {
    case "image/jpeg":
      return buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    case "image/png":
      return (
        buffer.length >= 8 &&
        buffer
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    case "image/webp":
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
      );
    case "video/mp4":
    case "video/quicktime":
      return (
        buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp"
      );
    default:
      return false;
  }
}

async function* chunksFrom(stream: ByteStream): AsyncGenerator<Uint8Array> {
  if (Symbol.asyncIterator in stream) {
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      yield chunk;
    }
    return;
  }
  const reader = stream.getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
}

async function ensureManagedDirectory(
  root: string,
  childName: "media" | "temp" | "trash",
): Promise<{ canonicalRoot: string; child: string }> {
  if (!isAbsolute(root) || root === "/") {
    throw new Error("Invalid media data root");
  }
  await mkdir(root, { recursive: true, mode: 0o700 });
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error("Media data root must be a real directory");
  }
  const canonicalRoot = await realpath(root);
  const child = resolve(canonicalRoot, childName);
  if (!isInside(canonicalRoot, child)) {
    throw new Error("Managed media path escaped its root");
  }
  await mkdir(child, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  const childInfo = await lstat(child);
  if (!childInfo.isDirectory() || childInfo.isSymbolicLink()) {
    throw new Error("Managed media directory cannot be a symbolic link");
  }
  const canonicalChild = await realpath(child);
  if (!isInside(canonicalRoot, canonicalChild)) {
    throw new Error("Managed media directory escaped its root");
  }
  return { canonicalRoot, child: canonicalChild };
}

export type ProjectMediaQuarantine = Readonly<{
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
}>;

const NO_PROJECT_MEDIA: ProjectMediaQuarantine = {
  commit: async () => undefined,
  rollback: async () => undefined,
};

export async function quarantineProjectMedia(
  dataRoot: string,
  projectId: string,
): Promise<ProjectMediaQuarantine> {
  assertResourceId(projectId, "project");
  const media = await ensureManagedDirectory(dataRoot, "media");
  const projectDirectory = resolve(media.child, projectId);
  if (!isInside(media.child, projectDirectory)) {
    throw new Error("Project media path escaped its root");
  }

  let projectInfo;
  try {
    projectInfo = await lstat(projectDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return NO_PROJECT_MEDIA;
    throw error;
  }
  if (!projectInfo.isDirectory() || projectInfo.isSymbolicLink()) {
    throw new Error("Project media directory must be a real directory");
  }
  const canonicalProject = await realpath(projectDirectory);
  if (!isInside(media.child, canonicalProject)) {
    throw new Error("Project media directory escaped its root");
  }

  const trash = await ensureManagedDirectory(dataRoot, "trash");
  const quarantinePath = resolve(
    trash.child,
    `deleted_${projectId}_${randomUUID()}`,
  );
  if (!isInside(trash.child, quarantinePath)) {
    throw new Error("Project quarantine path escaped its root");
  }
  await rename(canonicalProject, quarantinePath);
  let settled = false;
  return {
    commit: async () => {
      if (settled) return;
      await rm(quarantinePath, { recursive: true, force: true });
      settled = true;
    },
    rollback: async () => {
      if (settled) return;
      await rename(quarantinePath, projectDirectory);
      settled = true;
    },
  };
}

async function ensureProjectDirectory(
  mediaDirectory: string,
  projectId: string,
): Promise<string> {
  assertResourceId(projectId, "project");
  const projectDirectory = resolve(mediaDirectory, projectId);
  if (!isInside(mediaDirectory, projectDirectory)) {
    throw new Error("Project media path escaped its root");
  }
  await mkdir(projectDirectory, { mode: 0o700 }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    },
  );
  const info = await lstat(projectDirectory);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error("Project media directory cannot be a symbolic link");
  }
  const canonical = await realpath(projectDirectory);
  if (!isInside(mediaDirectory, canonical)) {
    throw new Error("Project media directory escaped its root");
  }
  return canonical;
}

export async function storeLocalAsset(
  input: StoreLocalAssetInput,
  dependencies: StoreDependencies = {},
): Promise<Asset> {
  const metadata = validateUploadMetadata({
    filename: input.originalFilename,
    declaredMime: input.declaredMime,
    kind: input.kind,
  });
  const repository = new ProjectRepository(input.database);
  repository.getProject(input.projectId);
  if (input.shotId) {
    const shot = repository.getShot(input.shotId);
    if (shot.projectId !== input.projectId) {
      throw new Error("Shot does not belong to project");
    }
  }

  const assetId = dependencies.createId?.() ?? `asset_${randomUUID()}`;
  assertResourceId(assetId, "asset");
  const byteLimit = input.maxBytes ?? metadata.maxBytes;
  if (!Number.isSafeInteger(byteLimit) || byteLimit <= 0 || byteLimit > metadata.maxBytes) {
    throw new Error("Invalid upload byte limit");
  }

  const temp = await ensureManagedDirectory(input.dataRoot, "temp");
  const tempPath = resolve(temp.child, `upload_${randomUUID()}.part`);
  if (!isInside(temp.child, tempPath)) {
    throw new Error("Temporary upload path escaped its root");
  }

  const handle = await open(tempPath, "wx", 0o600);
  const hash = createHash("sha256");
  const header = Buffer.alloc(HEADER_BYTES);
  let headerLength = 0;
  let byteSize = 0;
  try {
    for await (const chunk of chunksFrom(input.stream)) {
      if (!(chunk instanceof Uint8Array)) {
        throw new Error("Upload stream returned an invalid chunk");
      }
      if (chunk.byteLength === 0) continue;
      byteSize += chunk.byteLength;
      if (byteSize > byteLimit) {
        throw new Error(`Upload exceeds the ${byteLimit} byte limit`);
      }
      if (headerLength < HEADER_BYTES) {
        const copied = Math.min(HEADER_BYTES - headerLength, chunk.byteLength);
        Buffer.from(chunk).copy(header, headerLength, 0, copied);
        headerLength += copied;
      }
      hash.update(chunk);
      await handle.write(chunk);
    }
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
  await handle.close();

  if (byteSize === 0 || !headerMatches(metadata.mimeType, header.subarray(0, headerLength))) {
    await rm(tempPath, { force: true });
    throw new Error("File signature does not match the declared media type");
  }

  const media = await ensureManagedDirectory(input.dataRoot, "media");
  const projectDirectory = await ensureProjectDirectory(media.child, input.projectId);
  const assetDirectory = resolve(projectDirectory, assetId);
  if (!isInside(projectDirectory, assetDirectory)) {
    await rm(tempPath, { force: true });
    throw new Error("Asset media path escaped its root");
  }
  try {
    await mkdir(assetDirectory, { mode: 0o700 });
  } catch {
    await rm(tempPath, { force: true });
    throw new Error("Asset storage identifier already exists");
  }

  const diskExtension = metadata.extension === ".jpeg" ? ".jpg" : metadata.extension;
  const filename = `${assetId}${diskExtension}`;
  const finalPath = resolve(assetDirectory, filename);
  try {
    await rename(tempPath, finalPath);
    const relativePath = posix.join(
      "media",
      input.projectId,
      assetId,
      filename,
    );
    return repository.insertAsset({
      id: assetId,
      projectId: input.projectId,
      ...(input.shotId === undefined ? {} : { shotId: input.shotId }),
      kind: input.kind,
      ...(input.source === undefined ? {} : { source: input.source }),
      relativePath,
      displayName: metadata.displayName,
      mimeType: metadata.mimeType,
      byteSize,
      sha256: hash.digest("hex"),
      createdAt: dependencies.now?.() ?? Date.now(),
    });
  } catch (error) {
    await rm(assetDirectory, { recursive: true, force: true }).catch(
      () => undefined,
    );
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function resolveAssetFile(dataRoot: string, asset: Asset): string {
  assertResourceId(asset.projectId, "project");
  assertResourceId(asset.id, "asset");
  if (asset.relativePath.includes("\\") || asset.relativePath.includes("\0")) {
    throw new Error("Invalid stored asset path");
  }
  const segments = asset.relativePath.split("/");
  if (
    segments.length !== 4 ||
    segments[0] !== "media" ||
    segments[1] !== asset.projectId ||
    segments[2] !== asset.id ||
    !segments[3]?.startsWith(`${asset.id}.`) ||
    posix.normalize(asset.relativePath) !== asset.relativePath
  ) {
    throw new Error("Invalid stored asset path");
  }

  const canonicalRoot = realpathSync(dataRoot);
  const candidate = resolve(canonicalRoot, ...segments);
  if (!isInside(canonicalRoot, candidate)) {
    throw new Error("Stored asset path escaped its root");
  }
  const info = lstatSync(candidate);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error("Stored asset is not a regular file");
  }
  const canonicalFile = realpathSync(candidate);
  if (!isInside(canonicalRoot, canonicalFile)) {
    throw new Error("Stored asset file escaped its root");
  }

  const descriptor = openSync(
    candidate,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.size !== asset.byteSize) {
      throw new Error("Stored asset size does not match its database record");
    }
  } finally {
    closeSync(descriptor);
  }
  return canonicalFile;
}

export function createAssetReadStream(dataRoot: string, asset: Asset) {
  const filename = resolveAssetFile(dataRoot, asset);
  const descriptor = openSync(
    filename,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  const info = fstatSync(descriptor);
  if (!info.isFile() || info.size !== asset.byteSize) {
    closeSync(descriptor);
    throw new Error("Stored asset size does not match its database record");
  }
  return createReadStream(filename, { fd: descriptor, autoClose: true });
}
