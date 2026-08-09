import { NextResponse } from "next/server";

import { listCapabilities } from "@/model-registry/registry";
import { localBoundaryError } from "@/server/http/api-response";
import { validateLocalApiRequest } from "@/server/http/local-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request: Request) {
  const local = validateLocalApiRequest(request, { mutation: false });
  if (!local.ok) return localBoundaryError(local);
  return NextResponse.json(
    {
      registryVersion: 1,
      capabilities: listCapabilities(),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
