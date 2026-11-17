import { hasDb } from "./db";
import { identityFromRequest, type Identity } from "./identity";

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

/** Returns the signed-in player, or a ready-made error response. */
export function requirePlayer(req: Request): Identity | Response {
  if (!hasDb()) return json({ error: "offline" }, 503);
  const who = identityFromRequest(req);
  return who ?? json({ error: "not_signed_in" }, 401);
}
