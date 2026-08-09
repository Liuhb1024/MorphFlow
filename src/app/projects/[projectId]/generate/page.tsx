import { notFound } from "next/navigation";

import { WorkbenchShell } from "@/components/workbench";
import { getProjectWorkspace } from "@/server/dal/projects";
import { createWorkbenchView } from "@/server/dal/workbench-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GeneratePageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function GeneratePage({ params }: GeneratePageProps) {
  const { projectId } = await params;

  let view;
  try {
    view = createWorkbenchView(getProjectWorkspace(projectId));
  } catch {
    notFound();
  }
  return <WorkbenchShell view={view} />;
}
