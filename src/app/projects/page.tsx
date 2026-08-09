import { ProjectLibrary } from "@/components/projects/ProjectLibrary";
import { listProjectSummaries, type ProjectSummaryDto } from "@/server/dal/projects";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function ProjectsPage() {
  let projects: ProjectSummaryDto[] = [];
  let unavailable = false;
  try {
    projects = listProjectSummaries();
  } catch {
    unavailable = true;
  }
  return <ProjectLibrary projects={projects} unavailable={unavailable}/>;
}
