import { notFound, redirect } from "next/navigation";

import { getProjectWorkspace } from "@/server/dal/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProjectPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;

  try {
    getProjectWorkspace(projectId);
  } catch {
    notFound();
  }

  redirect(`/projects/${projectId}/overview`);
}
