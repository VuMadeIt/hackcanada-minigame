import { eq } from "drizzle-orm";
import { CASINO_UNLOCK_LEVEL } from "@/game/config";
import { spinCost } from "@/game/casino";
import { levelFor, xpForLevel } from "@/game/engine";
import { db } from "@/server/db";
import { json, readJson, requirePlayer } from "@/server/http";
import { testToolsAllowed } from "@/server/identity";
import { rowState } from "@/server/players";
import { players } from "@/server/schema";

// Test buttons for trying the casino without playing up to it. Off unless ALLOW_TEST_TOOLS=true
// (or a dev server). Coins go through casinoCoins so the save checks still add up.
export async function POST(req: Request) {
  if (!testToolsAllowed()) return json({ error: "not_found" }, 404);
  const who = requirePlayer(req);
  if (who instanceof Response) return who;
  const body = await readJson(req);
  const what = body.what;
  if (what !== "casino" && what !== "coins" && what !== "spins") return json({ error: "bad_request" }, 400);

  return db().transaction(async (tx) => {
    const [row] = await tx.select().from(players).where(eq(players.id, who.id)).for("update");
    if (!row) return json({ error: "no_player" }, 404);
    const now = Date.now();
    const s = rowState(row);
    let coins = 0;
    let spins = 0;
    if (what === "casino") {
      const need = xpForLevel(CASINO_UNLOCK_LEVEL) + 1;
      if (s.lifetimeWood < need) {
        const add = need - s.lifetimeWood;
        s.lifetimeWood += add;
        s.wood += add;
      }
      coins = spinCost(s, now) * 20;
    } else if (what === "coins") coins = spinCost(s, now) * 20;
    else spins = 10;
    s.coins += coins;
    s.savedAt = now;
    const [saved] = await tx
      .update(players)
      .set({
        state: s,
        rev: row.rev + 1,
        lifetimeWood: s.lifetimeWood,
        level: levelFor(s.lifetimeWood),
        savedAt: new Date(now),
        casinoCoins: row.casinoCoins + coins,
        freeSpins: row.freeSpins + spins,
      })
      .where(eq(players.id, who.id))
      .returning({ rev: players.rev, freeSpins: players.freeSpins });
    return json({ state: s, rev: saved.rev, freeSpins: saved.freeSpins });
  });
}
