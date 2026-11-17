import { hasDb } from "@/server/db";
import { json, readJson } from "@/server/http";
import { devLoginAllowed, fromDashboardToken, fromDevName, identityFromRequest, issueSession, type Identity } from "@/server/identity";
import { getOrCreatePlayer, rowState } from "@/server/players";

// POST { token } from the dashboard, or { devName } for local testing,
// or an existing Bearer session to just reload the save.
export async function POST(req: Request) {
  if (!hasDb()) return json({ error: "offline" }, 503);
  const body = await readJson(req);
  let who: Identity | null = null;
  if (typeof body.token === "string") who = fromDashboardToken(body.token);
  else if (typeof body.devName === "string" && devLoginAllowed()) who = fromDevName(body.devName);
  else who = identityFromRequest(req);
  if (!who) return json({ error: "not_signed_in", devLogin: devLoginAllowed() }, 401);

  const { row, fresh } = await getOrCreatePlayer(who);
  return json({
    session: issueSession(who),
    player: { id: who.id, name: who.name },
    state: rowState(row),
    rev: row.rev,
    fresh,
    freeSpins: row.freeSpins,
  });
}
