import { MacOSKeychain } from "@/server/secrets/keychain";
import { createProviderKeyHandlers } from "@/server/settings/provider-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handlers = createProviderKeyHandlers(new MacOSKeychain());

export const GET = handlers.GET;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
