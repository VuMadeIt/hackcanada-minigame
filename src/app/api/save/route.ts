import { and, eq } from "drizzle-orm";
import { levelFor } from "@/game/engine";
import { db } from "@/server/db";
import { json, readJson, requirePlayer } from "@/server/http";
import { getOrCreatePlayer, rowState, stored } from "@/server/players";
import { players } from "@/server/schema";
import { checkSave } from "@/server/validate";

export async function POST(req: Request) {
  const who = requirePlayer(req);
  if (who instanceof Response) return who;
  const body = await readJson(req);
  const { row, fresh } = await getOrCreatePlayer(who);

  if (body.rev !== row.rev) return json({ error: "stale", state: rowState(row), rev: row.rev }, 409);

  const now = Date.now();
  const firstImport = (fresh || row.rev === 0) && body.import === true;
  const verdict = checkSave(stored(row), body.state, now, { firstImport });
  if (!verdict.ok) {
    await db().update(players).set({ flags: row.flags + 1 }).where(eq(players.id, who.id));
    return json({ error: "rejected", reason: verdict.reason, state: rowState(row), rev: row.rev }, 409);
  }
  const s = verdict.state;
  s.savedAt = now;
  const updated = await db()
    .update(players)
    .set({ state: s, rev: row.rev + 1, lifetimeWood: s.lifetimeWood, level: levelFor(s.lifetimeWood), savedAt: new Date(now) })
    .where(and(eq(players.id, who.id), eq(players.rev, row.rev)))
    .returning({ rev: players.rev });
  if (!updated[0]) {
    const { row: latest } = await getOrCreatePlayer(who);
    return json({ error: "stale", state: rowState(latest), rev: latest.rev }, 409);
  }
  return json({ rev: updated[0].rev });
}
