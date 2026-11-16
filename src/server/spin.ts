import { randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { applyOutcome, casinoOpen, PAYOUT, roll, spinCost, type Outcome, type Reward, type Sym } from "@/game/casino";
import { levelFor } from "@/game/engine";
import type { GameState } from "@/game/state";
import { db } from "./db";
import type { Identity } from "./identity";
import { stored } from "./players";
import { PRIZE_SHELF } from "./prizes";
import { players, prizeClaims, prizes, spins } from "./schema";
import { checkSave } from "./validate";

const rng = () => randomInt(0, 2 ** 47) / 2 ** 47;

export type SpinResult =
  | { ok: true; state: GameState; rev: number; reels: [Sym, Sym, Sym]; outcome: Outcome; bet: number; free: boolean; reward: Reward; prize: { name: string; code: string } | null; freeSpins: number }
  | { ok: false; error: string; reason?: string; state?: GameState; rev?: number };

function claimCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += abc[b[i] % abc.length];
  return `TIMBER-${out.slice(0, 4)}-${out.slice(4)}`;
}

export async function seedPrizes() {
  await db()
    .insert(prizes)
    .values(PRIZE_SHELF.map((p) => ({ ...p })))
    .onConflictDoNothing();
}

/** Save the client's latest state and spin, in one transaction so coins can't be spent twice. */
export async function spin(who: Identity, body: { state?: unknown; rev?: unknown }): Promise<SpinResult> {
  await seedPrizes();
  return db().transaction(async (tx) => {
    const [row] = await tx.select().from(players).where(eq(players.id, who.id)).for("update");
    if (!row) return { ok: false, error: "no_player" };
    const now = Date.now();
    if (body.rev !== row.rev) return { ok: false, error: "stale", state: stored(row).state, rev: row.rev };
    const v = checkSave(stored(row), body.state, now);
    if (!v.ok) {
      await tx.update(players).set({ flags: row.flags + 1 }).where(eq(players.id, who.id));
      return { ok: false, error: "rejected", reason: v.reason, state: stored(row).state, rev: row.rev };
    }
    const s = v.state;
    if (!casinoOpen(s)) return { ok: false, error: "locked" };

    const bet = spinCost(s, now);
    const free = row.freeSpins > 0;
    if (!free) {
      if (s.coins < bet) return { ok: false, error: "poor" };
      s.coins -= bet;
    }
    s.stats.spins++;

    const { outcome, reels } = roll(rng);
    let reward: Reward = { coins: 0, wood: 0, freeSpins: 0, upgrade: null };
    let prize: { name: string; code: string } | null = null;

    if (outcome === "jackpot") {
      let shelf = await tx.select().from(prizes).where(gt(prizes.stock, prizes.awarded));
      let chosen: (typeof shelf)[number] | null = null;
      // someone else can grab the last one of a prize at the same moment; then try the rest
      while (shelf.length && !chosen) {
        const total = shelf.reduce((a, p) => a + p.weight, 0);
        let pick = rng() * total;
        const p = shelf.find((x) => (pick -= x.weight) < 0) ?? shelf[0];
        const taken = await tx
          .update(prizes)
          .set({ awarded: sql`${prizes.awarded} + 1` })
          .where(and(eq(prizes.id, p.id), gt(prizes.stock, prizes.awarded)))
          .returning({ id: prizes.id });
        if (taken[0]) chosen = p;
        else shelf = shelf.filter((x) => x.id !== p.id);
      }
      if (chosen) {
        prize = { name: chosen.name, code: claimCode() };
        await tx.insert(prizeClaims).values({ playerId: who.id, playerName: who.name, prizeId: chosen.id, prizeName: chosen.name, code: prize.code });
      } else {
        reward.coins = bet * PAYOUT.jackpotFallback;
        s.coins += reward.coins;
      }
    } else {
      reward = applyOutcome(s, outcome, bet, now, rng);
    }

    s.savedAt = now;
    const freeSpins = row.freeSpins - (free ? 1 : 0) + reward.freeSpins;
    const [saved] = await tx
      .update(players)
      .set({
        state: s,
        rev: row.rev + 1,
        lifetimeWood: s.lifetimeWood,
        level: levelFor(s.lifetimeWood),
        savedAt: new Date(now),
        // net of bets, so a save can't put back coins that were already wagered
        casinoCoins: row.casinoCoins + reward.coins - (free ? 0 : bet),
        casinoUpgradeValue: row.casinoUpgradeValue + (reward.upgrade?.value ?? 0),
        casinoWood: row.casinoWood + reward.wood,
        freeSpins,
      })
      .where(eq(players.id, who.id))
      .returning({ rev: players.rev });
    await tx.insert(spins).values({ playerId: who.id, bet: free ? 0 : bet, reels: reels.join(","), outcome, payout: reward.coins });
    return { ok: true, state: s, rev: saved.rev, reels, outcome, bet, free, reward, prize, freeSpins };
  });
}
