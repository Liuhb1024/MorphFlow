import { toCapabilityViews } from "@/components/workbench/registry-view";
import type {
  AssetView,
  WorkbenchViewModel,
} from "@/components/workbench/types";
import { listCapabilities } from "@/model-registry/registry";

import type { AssetDto, ProjectWorkspaceDto } from "./projects";

function isImage(asset: AssetDto): boolean {
  return asset.mimeType.startsWith("image/");
}

function assetLabel(asset: AssetDto): string {
  if (asset.kind === "first_frame") return "首帧 A";
  if (asset.kind === "last_frame") return "尾帧 B";
  return asset.displayName;
}

export function createWorkbenchView(
  workspace: ProjectWorkspaceDto,
): WorkbenchViewModel {
  const images = workspace.assets.filter(isImage);
  const first =
    images.find((asset) => asset.kind === "first_frame") ?? images[0];
  const last =
    images.find(
      (asset) => asset.kind === "last_frame" && asset.id !== first?.id,
    ) ?? images.find((asset) => asset.id !== first?.id);
  const assets: AssetView[] = workspace.assets.map((asset) => ({
    id: asset.id,
    label: assetLabel(asset),
    role:
      asset.id === first?.id
        ? "first-frame"
        : asset.id === last?.id
          ? "last-frame"
          : "reference",
    sourceLabel: `${asset.source === "local_upload" ? "本地上传" : "派生素材"} · ${Math.max(1, Math.round(asset.byteSize / 1_024))} KB`,
    src: asset.contentUrl,
    alt: asset.displayName,
    mediaType: asset.mimeType.startsWith("image/") ? "image" : asset.mimeType.startsWith("video/") ? "video" : "audio",
  }));
  const capabilities = toCapabilityViews(
    listCapabilities().filter((capability) => capability.category === "video" && capability.modeId !== "subject-control"),
    {
      ...(first
        ? {
            first_frame: first.id,
            reference_image: first.id,
            subject_image: first.id,
            sketch: first.id,
          }
        : {}),
      ...(last ? { last_frame: last.id } : {}),
    },
  );
  const preferredCapability = first && last
    ? "kling-v3:first-last-frame"
    : "kling-v3:image-to-video";
  return {
    project: {
      id: workspace.project.id,
      name: workspace.project.name,
      eyebrow: "LOCAL PROJECT",
    },
    assets,
    capabilities,
    initialCapabilityId:
      capabilities.find((item) => item.id === preferredCapability)?.id ??
      capabilities[0]?.id ??
      capabilities[0]?.id ?? "",
  };
}
