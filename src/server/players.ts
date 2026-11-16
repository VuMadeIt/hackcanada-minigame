import { eq } from "drizzle-orm";
import { newGame, normalize, type GameState } from "@/game/state";
import { levelFor } from "@/game/engine";
import { db } from "./db";
import type { Identity } from "./identity";
import { players, type PlayerRow } from "./schema";

export async function getOrCreatePlayer(who: Identity): Promise<{ row: PlayerRow; fresh: boolean }> {
  const found = await db().select().from(players).where(eq(players.id, who.id)).limit(1);
  if (found[0]) {
    if (found[0].name !== who.name) await db().update(players).set({ name: who.name }).where(eq(players.id, who.id));
    return { row: { ...found[0], name: who.name }, fresh: false };
  }
  const now = Date.now();
  const inserted = await db()
    .insert(players)
    .values({ id: who.id, name: who.name, state: newGame(now), savedAt: new Date(now) })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return { row: inserted[0], fresh: true };
  const again = await db().select().from(players).where(eq(players.id, who.id)).limit(1);
  return { row: again[0], fresh: false };
}

export function rowState(row: PlayerRow): GameState {
  return normalize(row.state, row.savedAt.getTime());
}

export function stored(row: PlayerRow) {
  return {
    state: rowState(row),
    savedAt: row.savedAt.getTime(),
    casinoCoins: row.casinoCoins,
    casinoUpgradeValue: row.casinoUpgradeValue,
  };
}

export const summary = (s: GameState) => ({ lifetimeWood: s.lifetimeWood, level: levelFor(s.lifetimeWood) });
