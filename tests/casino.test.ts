import { describe, expect, it } from "vitest";
import { applyOutcome, ODDS, PAIR_ODDS, PAYOUT, passiveWoodPerSec, roll, spinCost } from "@/game/casino";
import { UPGRADES } from "@/game/config";
import { buyBuilding, derive } from "@/game/engine";
import { newGame } from "@/game/state";

function seeded(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

describe("slot machine", () => {
  it("hits 777 three percent of the time, rarer than anything else", () => {
    const rng = seeded(7);
    const n = 200_000;
    let jackpots = 0;
    const counts: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const r = roll(rng);
      counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
      if (r.outcome === "jackpot") jackpots++;
    }
    expect(jackpots / n).toBeGreaterThan(0.028);
    expect(jackpots / n).toBeLessThan(0.032);
    const jackpot = ODDS.find((o) => o.outcome === "jackpot")!.p;
    for (const o of ODDS) if (o.outcome !== "jackpot") expect(o.p).toBeGreaterThan(jackpot);
    expect(counts.pair / n).toBeCloseTo(PAIR_ODDS, 2);
    for (const o of ODDS) expect(counts[o.outcome] / n).toBeCloseTo(o.p, 2);
  });

  it("only shows three of a kind when it pays that way", () => {
    const rng = seeded(11);
    for (let i = 0; i < 20_000; i++) {
      const { outcome, reels } = roll(rng);
      const triple = reels[0] === reels[1] && reels[1] === reels[2];
      if (outcome === "pair") expect(new Set(reels).size).toBe(2);
      if (outcome === "miss") expect(triple).toBe(false);
      if (outcome === "jackpot") expect(reels).toEqual(["seven", "seven", "seven"]);
      if (outcome !== "pair" && outcome !== "miss") expect(triple).toBe(true);
    }
  });

  it("puts lots of misses one seven away from the jackpot", () => {
    const rng = seeded(3);
    let miss = 0;
    let close = 0;
    for (let i = 0; i < 20_000; i++) {
      const r = roll(rng);
      if (r.outcome !== "miss") continue;
      miss++;
      if (r.reels[0] === "seven" && r.reels[1] === "seven") close++;
    }
    expect(close / miss).toBeGreaterThan(0.3);
  });

  it("pays coins, wood and free spins on the right outcomes", () => {
    const s = newGame(0);
    s.lifetimeWood = 1e6;
    const rng = seeded(1);
    expect(applyOutcome(s, "coins", 100, 0, rng).coins).toBe(100 * PAYOUT.coins);
    expect(applyOutcome(s, "pair", 100, 0, rng).coins).toBe(100);
    expect(applyOutcome(s, "spins", 100, 0, rng).freeSpins).toBe(PAYOUT.freeSpins);
    const before = s.lifetimeWood;
    const w = applyOutcome(s, "wood", 100, 0, rng).wood;
    expect(w).toBeCloseTo(100 * PAYOUT.wood);
    expect(s.lifetimeWood).toBe(before + w);
    expect(applyOutcome(s, "miss", 100, 0, rng)).toEqual({ coins: 0, wood: 0, freeSpins: 0, upgrade: null });
  });

  it("gives a random unlocked upgrade, or coins once everything is maxed", () => {
    const s = newGame(0);
    s.lifetimeWood = 5e7;
    const r = applyOutcome(s, "upgrade", 100, 0, seeded(5));
    expect(r.upgrade).not.toBeNull();
    expect(s.upgrades[r.upgrade!.id]).toBe(1);

    const maxed = newGame(0);
    maxed.lifetimeWood = 5e7;
    for (const u of UPGRADES) maxed.upgrades[u.id] = u.max;
    const r2 = applyOutcome(maxed, "upgrade", 100, 0, seeded(5));
    expect(r2.upgrade).toBeNull();
    expect(r2.coins).toBe(100 * PAYOUT.leaves);
  });

  it("never hands out an upgrade worth more than a few bets", () => {
    for (let i = 0; i < 50; i++) {
      const s = newGame(0);
      s.lifetimeWood = 5e7;
      const r = applyOutcome(s, "upgrade", 10, 0, seeded(i));
      if (r.upgrade) expect(r.upgrade.value).toBeLessThanOrEqual(10 * PAYOUT.upgradeCap);
      else expect(r.coins).toBe(10 * PAYOUT.leaves);
    }
  });

  it("prices a spin at about 15 minutes of passive income, whatever your axe", () => {
    const s = newGame(0);
    expect(spinCost(s, 0)).toBeGreaterThanOrEqual(50);
    s.coins = 1e12;
    for (let i = 0; i < 20; i++) buyBuilding(s, "paper_mill");
    const d = derive(s, 0);
    const quarterHour = passiveWoodPerSec(d) * 15 * 60 * d.priceBase;
    const cost = spinCost(s, 0);
    expect(cost).toBeGreaterThanOrEqual(quarterHour);
    expect(cost).toBeLessThan(quarterHour * 1.1);
    s.tool = 2;
    expect(spinCost(s, 0)).toBe(cost);
  });
});
