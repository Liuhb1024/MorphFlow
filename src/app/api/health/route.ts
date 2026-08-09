import { NextResponse } from "next/server";

import { probeConfiguredDatabase } from "@/server/health/database";
import { collectLocalRuntimeHealth } from "@/server/health/runtime";
import { localBoundaryError } from "@/server/http/api-response";
import { validateLocalApiRequest } from "@/server/http/local-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const local = validateLocalApiRequest(request, { mutation: false });
  if (!local.ok) return localBoundaryError(local);
  const health = await collectLocalRuntimeHealth({
    nodeVersion: process.version,
    databaseProbe: probeConfiguredDatabase,
  });

  return NextResponse.json(health, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
