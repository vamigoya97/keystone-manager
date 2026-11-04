import type { Keystone } from "./keystones";
import { passContent, publicBaseUrl } from "./passMetadata";

/** Server-side: what this keystone would commit on chain right now (public URL resolved). */
export async function keystonePassContent(exp: Keystone, req: Request) {
  return passContent(exp, { baseUrl: publicBaseUrl(req) });
}
