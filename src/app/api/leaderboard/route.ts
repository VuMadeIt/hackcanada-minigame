import { and, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { db, hasDb } from "@/server/db";
import { json } from "@/server/http";
import { identityFromRequest } from "@/server/identity";
import { players } from "@/server/schema";

// saves that kept failing the cheat checks don't get a spot on the board
const FLAG_LIMIT = 5;
const TOP = 50;

export async function GET(req: Request) {
  if (!hasDb()) return json({ top: [], me: null, players: 0 });
  const honest = lt(players.flags, FLAG_LIMIT);
  const top = await db()
    .select({ id: players.id, name: players.name, wood: players.lifetimeWood, level: players.level })
    .from(players)
    .where(and(honest, gt(players.lifetimeWood, 0)))
    .orderBy(desc(players.lifetimeWood), players.createdAt, players.id)
    .limit(TOP);
  const [{ n }] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(players)
    .where(and(honest, gt(players.lifetimeWood, 0)));

  let me: { rank: number; name: string; wood: number; level: number } | null = null;
  const who = identityFromRequest(req);
  if (who) {
    const [row] = await db()
      .select({ wood: players.lifetimeWood, level: players.level, name: players.name, flags: players.flags })
      .from(players)
      .where(sql`${players.id} = ${who.id}`);
    // same rules as the top list, so you never get a rank the board doesn't show
    if (row && row.flags < FLAG_LIMIT && row.wood > 0) {
      const [{ ahead }] = await db()
        .select({ ahead: sql<number>`count(*)::int` })
        .from(players)
        // ties go to whoever started first, matching the top list's order
        // compared in SQL, since JS dates drop the microseconds Postgres keeps
        .where(
          and(
            honest,
            or(
              gt(players.lifetimeWood, row.wood),
              and(
                eq(players.lifetimeWood, row.wood),
                sql`(${players.createdAt}, ${players.id}) < (select created_at, id from players where id = ${who.id})`,
              ),
            ),
          ),
        );
      me = { rank: ahead + 1, name: row.name, wood: row.wood, level: row.level };
    }
  }
  return json({ top: top.map(({ id, ...p }, i) => ({ rank: i + 1, ...p, you: id === who?.id })), me, players: n });
}
