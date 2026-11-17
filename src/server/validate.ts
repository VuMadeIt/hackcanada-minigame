import { BUILDINGS, GOLDEN, MARKET, TOOLS, UPGRADES, ZONES } from "@/game/config";
import { derive, levelFor, pileSize, spentTotal, woodRateCeiling } from "@/game/engine";
import { normalize, type GameState } from "@/game/state";

export interface Stored {
  state: GameState;
  savedAt: number;
  casinoCoins: number;
  casinoUpgradeValue: number;
}

export type Verdict = { ok: true; state: GameState } | { ok: false; reason: string };

const EPS = (n: number) => 1 + Math.abs(n) * 1e-6;

/**
 * Checks that a save the browser sent could really have come from playing.
 * It doesn't replay every click; it checks totals add up and that wood didn't grow
 * faster than the best possible play since the last save.
 */
export function checkSave(prev: Stored, incoming: unknown, now: number, opts: { firstImport?: boolean } = {}): Verdict {
  const s = normalize(incoming, now);
  const p = prev.state;

  if (s.tool > TOOLS.length - 1) return { ok: false, reason: "bad_tool" };
  for (const [id, v] of Object.entries(s.upgrades)) {
    const u = UPGRADES.find((x) => x.id === id);
    if (!u || !Number.isInteger(v) || v! < 0 || v! > u.max) return { ok: false, reason: "bad_upgrade" };
  }
  for (const [id, v] of Object.entries(s.buildings)) {
    if (!BUILDINGS.some((b) => b.id === id) || !Number.isInteger(v) || v! < 0 || v! > 100_000) return { ok: false, reason: "bad_building" };
  }
  const zone = ZONES.find((z) => z.id === s.zone);
  if (!zone || levelFor(s.lifetimeWood) < zone.unlockLevel) return { ok: false, reason: "bad_zone" };

  if (s.lifetimeWood + EPS(p.lifetimeWood) < p.lifetimeWood) return { ok: false, reason: "went_backwards" };

  // wood only leaves your pile by selling it
  if (s.wood + s.stats.woodSold > s.lifetimeWood + EPS(s.lifetimeWood) * 1.0001) return { ok: false, reason: "wood_mismatch" };

  // coins only come from selling wood (at most the best price) or from the casino
  const bestPrice = derive(s, now).priceBase * MARKET.maxFactor;
  if (s.lifetimeCoins > s.stats.woodSold * bestPrice + EPS(s.lifetimeCoins)) return { ok: false, reason: "coins_mismatch" };
  const spent = spentTotal(s);
  if (s.coins + spent > s.lifetimeCoins + prev.casinoCoins + prev.casinoUpgradeValue + EPS(s.lifetimeCoins + spent)) {
    return { ok: false, reason: "spent_mismatch" };
  }

  // a frenzy only comes from catching a golden leaf, so it can't run longer than one does
  const maxBuffAt = now + Math.max(GOLDEN.frenzySec, GOLDEN.stormSec) * 1000 + 5000;
  // clamp rather than reject, since the browser clock can be a bit off from ours
  s.frenzyUntil = Math.min(s.frenzyUntil, maxBuffAt);
  s.stormUntil = Math.min(s.stormUntil, maxBuffAt);

  // speed limit: perfect play without frenzy, plus a frenzy and a log pile from every golden leaf
  // that could have shown up in that time
  const dt = Math.max(1, (now - prev.savedAt) / 1000) + (opts.firstImport ? 3 * 3600 : 0);
  const base = Math.max(woodRateCeiling(p), woodRateCeiling(s)) / GOLDEN.frenzyMult;
  const lucky = Math.max(p.upgrades.lucky_sapling ?? 0, s.upgrades.lucky_sapling ?? 0);
  const goldens = dt / (GOLDEN.minGapSec * Math.max(0.2, 1 - GOLDEN.luckyGapCut * lucky)) + 1;
  const frenzyExtra = goldens * GOLDEN.frenzySec * base * (GOLDEN.frenzyMult - 1);
  const ceiling = base * dt * 1.25 + frenzyExtra + goldens * Math.max(pileSize(p, now), pileSize(s, now)) * 1.2 + 200;
  if (s.lifetimeWood - p.lifetimeWood > ceiling) return { ok: false, reason: "too_fast" };

  return { ok: true, state: s };
}
