import { CASINO_UNLOCK_LEVEL, UPGRADES, type UpgradeId } from "./config";
import { derive, levelFor, pileSize, upgradeCost, type Rng } from "./engine";
import type { GameState } from "./state";

export type Sym = "seven" | "coin" | "log" | "leaf" | "beaver" | "gem";
export const SYMBOLS: Sym[] = ["seven", "coin", "log", "leaf", "beaver", "gem"];

export type Outcome = "jackpot" | "coins" | "wood" | "leaves" | "spins" | "upgrade" | "pair" | "miss";

// chance per spin; whatever's left over is a miss
export const ODDS: { outcome: Exclude<Outcome, "pair" | "miss">; sym: Sym; p: number }[] = [
  { outcome: "jackpot", sym: "seven", p: 0.02 },
  { outcome: "upgrade", sym: "gem", p: 0.03 },
  { outcome: "spins", sym: "beaver", p: 0.04 },
  { outcome: "leaves", sym: "leaf", p: 0.05 },
  { outcome: "coins", sym: "coin", p: 0.06 },
  { outcome: "wood", sym: "log", p: 0.08 },
];
export const PAIR_ODDS = 0.2;

export const PAYOUT = {
  coins: 8, // x bet
  leaves: 3, // x bet
  pair: 1, // money back
  wood: 4, // x a golden beaver log pile
  freeSpins: 2,
  jackpotFallback: 50, // x bet, when the prize shelf is empty
};

export const casinoOpen = (s: GameState) => levelFor(s.lifetimeWood) >= CASINO_UNLOCK_LEVEL;

/** About a minute of what you'd make chopping and selling, rounded to something friendly. */
export function spinCost(s: GameState, now: number): number {
  const d = derive(s, now);
  const woodPerSec = d.passive + d.autoChopsPerSec * d.chopPower * 0.5 + 4 * d.chopPower;
  const raw = Math.max(50, woodPerSec * 60 * d.priceBase);
  const mag = 10 ** Math.floor(Math.log10(raw));
  return Math.ceil(raw / (mag / 2)) * (mag / 2);
}

export function roll(rng: Rng): { outcome: Outcome; reels: [Sym, Sym, Sym] } {
  let r = rng();
  for (const o of ODDS) {
    if (r < o.p) return { outcome: o.outcome, reels: [o.sym, o.sym, o.sym] };
    r -= o.p;
  }
  const pick = (not?: Sym) => {
    const pool = SYMBOLS.filter((x) => x !== not);
    return pool[Math.floor(rng() * pool.length)];
  };
  if (r < PAIR_ODDS) {
    const a = pick();
    const b = pick(a);
    const reels: [Sym, Sym, Sym] = [a, a, b];
    const slot = Math.floor(rng() * 3);
    [reels[slot], reels[2]] = [reels[2], reels[slot]];
    return { outcome: "pair", reels };
  }
  // misses mostly land as a near miss on the jackpot, because that's what keeps the lever moving
  if (rng() < 0.35) return { outcome: "miss", reels: ["seven", "seven", pick("seven")] };
  const a = pick();
  const b = pick(a);
  const c = SYMBOLS.filter((x) => x !== a && x !== b)[Math.floor(rng() * 4)];
  return { outcome: "miss", reels: [a, b, c] };
}

export interface Reward {
  coins: number;
  wood: number;
  freeSpins: number;
  upgrade: { id: UpgradeId; name: string; value: number } | null;
}

/** Applies a non-jackpot result. The jackpot needs the prize shelf, so the server handles it. */
export function applyOutcome(s: GameState, outcome: Outcome, bet: number, now: number, rng: Rng): Reward {
  const r: Reward = { coins: 0, wood: 0, freeSpins: 0, upgrade: null };
  if (outcome === "coins") r.coins = bet * PAYOUT.coins;
  else if (outcome === "leaves") r.coins = bet * PAYOUT.leaves;
  else if (outcome === "pair") r.coins = bet * PAYOUT.pair;
  else if (outcome === "wood") r.wood = pileSize(s, now) * PAYOUT.wood;
  else if (outcome === "spins") r.freeSpins = PAYOUT.freeSpins;
  else if (outcome === "upgrade") {
    const lvl = levelFor(s.lifetimeWood);
    const open = UPGRADES.filter((u) => u.unlockLevel <= lvl && (s.upgrades[u.id] ?? 0) < u.max);
    if (open.length) {
      const u = open[Math.floor(rng() * open.length)];
      const have = s.upgrades[u.id] ?? 0;
      r.upgrade = { id: u.id, name: u.name, value: upgradeCost(u.id, have) };
      s.upgrades[u.id] = have + 1;
    } else r.coins = bet * PAYOUT.coins;
  }
  s.coins += r.coins;
  s.wood += r.wood;
  s.lifetimeWood += r.wood;
  return r;
}
