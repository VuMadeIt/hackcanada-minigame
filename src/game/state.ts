import type { BuildingId, UpgradeId, ZoneId } from "./config";

export interface TreeState {
  species: string;
  hp: number;
  maxHp: number;
  /** while a stump is showing, chops are ignored until this time */
  regrowAt: number;
}

export interface GameState {
  v: 1;
  wood: number;
  coins: number;
  lifetimeWood: number;
  lifetimeCoins: number;
  tool: number;
  upgrades: Partial<Record<UpgradeId, number>>;
  buildings: Partial<Record<BuildingId, number>>;
  zone: ZoneId;
  tree: TreeState;
  combo: number;
  lastChopAt: number;
  frenzyUntil: number;
  stormUntil: number;
  nextGoldenAt: number;
  autoChopCarry: number;
  savedAt: number;
  stats: {
    chops: number;
    crits: number;
    megaCrits: number;
    treesFelled: number;
    bestCombo: number;
    goldenCaught: number;
    woodSold: number;
    spins: number;
  };
}

export function newGame(now: number): GameState {
  return {
    v: 1,
    wood: 0,
    coins: 0,
    lifetimeWood: 0,
    lifetimeCoins: 0,
    tool: 0,
    upgrades: {},
    buildings: {},
    zone: "meadow",
    tree: { species: "oak", hp: 18, maxHp: 18, regrowAt: 0 },
    combo: 0,
    lastChopAt: 0,
    frenzyUntil: 0,
    stormUntil: 0,
    nextGoldenAt: now + 45_000,
    autoChopCarry: 0,
    savedAt: now,
    stats: {
      chops: 0,
      crits: 0,
      megaCrits: 0,
      treesFelled: 0,
      bestCombo: 0,
      goldenCaught: 0,
      woodSold: 0,
      spins: 0,
    },
  };
}

const finite = (n: unknown, fallback = 0) => (typeof n === "number" && Number.isFinite(n) ? n : fallback);

/** Fill in anything missing from an older or hand-edited save. */
export function normalize(raw: unknown, now: number): GameState {
  const base = newGame(now);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<GameState>;
  return {
    ...base,
    ...r,
    v: 1,
    wood: Math.max(0, finite(r.wood)),
    coins: Math.max(0, finite(r.coins)),
    lifetimeWood: Math.max(0, finite(r.lifetimeWood)),
    lifetimeCoins: Math.max(0, finite(r.lifetimeCoins)),
    tool: Math.max(0, Math.floor(finite(r.tool))),
    upgrades: { ...(r.upgrades ?? {}) },
    buildings: { ...(r.buildings ?? {}) },
    tree: { ...base.tree, ...(r.tree ?? {}) },
    stats: { ...base.stats, ...(r.stats ?? {}) },
  };
}
