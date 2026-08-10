import { DmxApiClient } from "@/server/providers/dmxapi/client";
import { MacOSKeychain } from "@/server/secrets/keychain";
import { createProviderConnectionTestHandler } from "@/server/settings/provider-connection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const store = new MacOSKeychain();

export const POST = createProviderConnectionTestHandler(
  new DmxApiClient({ secretStore: store }),
);
