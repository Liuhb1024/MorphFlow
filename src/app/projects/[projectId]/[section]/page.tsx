import { notFound } from "next/navigation";

import {
  StudioSectionPage,
  type StaticStudioSection,
} from "@/components/studio";
import { getProjectWorkspace } from "@/server/dal/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supportedSections = new Set<StaticStudioSection>([
  "overview",
  "media",
  "image",
  "director",
  "jobs",
  "settings",
]);

type SectionPageProps = {
  params: Promise<{ projectId: string; section: string }>;
};

export default async function SectionPage({ params }: SectionPageProps) {
  const { projectId, section } = await params;

  if (!supportedSections.has(section as StaticStudioSection)) {
    notFound();
  }

  let workspace;
  try {
    workspace = getProjectWorkspace(projectId);
  } catch {
    notFound();
  }
  return (
    <StudioSectionPage
      assets={workspace.assets.map((asset) => ({
        id: asset.id,
        contentUrl: asset.contentUrl,
        displayName: asset.displayName,
        kind: asset.kind,
        mimeType: asset.mimeType,
        byteSize: asset.byteSize,
      }))}
      projectDescription={workspace.project.description}
      projectId={workspace.project.id}
      projectName={workspace.project.name}
      section={section as StaticStudioSection}
      shots={workspace.shots.map((shot) => ({
        id: shot.id,
        name: shot.name,
        description: shot.description,
        position: shot.position,
      }))}
    />
  );
}
