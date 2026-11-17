import {
  BUILDING_GROWTH,
  BUILDINGS,
  CHAINSAW_AUTO_CHOPS,
  CHOP,
  GOLDEN,
  LEVELS,
  MARKET,
  OFFLINE,
  TOOLS,
  UPGRADES,
  ZONES,
  type BuildingId,
  type UpgradeId,
  type ZoneId,
} from "./config";
import type { GameState, TreeState } from "./state";

export type Rng = () => number;

// ---------- levels ----------

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const g = LEVELS.growth;
  return (LEVELS.firstLevelXp * (g ** (level - 1) - 1)) / (g - 1);
}

export function levelFor(xp: number): number {
  const g = LEVELS.growth;
  const lvl = 1 + Math.floor(Math.log(1 + (xp * (g - 1)) / LEVELS.firstLevelXp) / Math.log(g) + 1e-9);
  // guard against float edge cases right on a threshold
  if (xpForLevel(lvl + 1) <= xp) return lvl + 1;
  if (xpForLevel(lvl) > xp) return lvl - 1;
  return lvl;
}

export function levelProgress(xp: number) {
  const level = levelFor(xp);
  const lo = xpForLevel(level);
  const hi = xpForLevel(level + 1);
  return { level, into: xp - lo, need: hi - lo, pct: (xp - lo) / (hi - lo) };
}

// ---------- derived numbers ----------

const lv = (s: GameState, id: UpgradeId) => s.upgrades[id] ?? 0;
const owned = (s: GameState, id: BuildingId) => s.buildings[id] ?? 0;

export function marketFactor(now: number): number {
  const t = now / 1000;
  return 1 + MARKET.swing * Math.sin((2 * Math.PI * t) / 180) + MARKET.wobble * Math.sin((2 * Math.PI * t) / 41);
}

export function zoneOf(s: GameState) {
  return ZONES.find((z) => z.id === s.zone) ?? ZONES[0];
}

export function derive(s: GameState, now: number) {
  const level = levelFor(s.lifetimeWood);
  const levelMult = 1 + LEVELS.bonusPerLevel * (level - 1);
  const zoneMult = zoneOf(s).mult;
  const frenzy = now < s.frenzyUntil ? GOLDEN.frenzyMult : 1;
  const storm = now < s.stormUntil;
  const tool = TOOLS[Math.min(s.tool, TOOLS.length - 1)];

  const chopPower = tool.power * (1 + 0.15 * lv(s, "whetstone")) * levelMult * zoneMult;
  const critChance = storm ? 1 : Math.min(0.6, CHOP.baseCritChance + CHOP.critChancePerLevel * lv(s, "lucky_sapling"));
  const autoChopsPerSec = lv(s, "robo_arm") + (tool.id === "chainsaw" ? CHAINSAW_AUTO_CHOPS : 0);

  let buildingRate = 0;
  for (const b of BUILDINGS) buildingRate += owned(s, b.id) * b.rate;
  const passive = buildingRate * (1 + 0.25 * lv(s, "bone_meal")) * levelMult * zoneMult;

  const priceBase = MARKET.basePrice * (1 + MARKET.hagglePerLevel * lv(s, "haggling"));
  const treeMaxHp = Math.max(1, chopPower * CHOP.treeHpChops * (1 - CHOP.wateringHpCut * lv(s, "watering_can")));
  const fellBonus = chopPower * CHOP.fellBonusChops * (1 + CHOP.splitterBonus * lv(s, "splitter"));
  const gnomeShare = 0.01 * lv(s, "gnome");
  const comboMult = 1 + Math.max(0, Math.min(s.combo, CHOP.comboMax) - 1) * CHOP.comboStep;

  // rough "what you're making right now" number for the HUD
  const autoWoodPerSec = autoChopsPerSec * chopPower * CHOP.autoChopShare;
  const woodPerSec = (passive + autoWoodPerSec) * frenzy;

  return {
    level,
    levelMult,
    zoneMult,
    frenzy,
    storm,
    tool,
    chopPower,
    critChance,
    autoChopsPerSec,
    passive,
    woodPerSec,
    priceBase,
    price: priceBase * marketFactor(now),
    treeMaxHp,
    fellBonus,
    gnomeShare,
    comboMult,
    totalMult: levelMult * zoneMult * frenzy * comboMult,
  };
}

export type Derived = ReturnType<typeof derive>;

// ---------- earning ----------

function earn(s: GameState, wood: number) {
  s.wood += wood;
  s.lifetimeWood += wood;
}

export function freshTree(s: GameState, now: number, d = derive(s, now)): TreeState {
  const species = zoneOf(s).trees[s.stats.treesFelled % zoneOf(s).trees.length];
  return { species, hp: d.treeMaxHp, maxHp: d.treeMaxHp, regrowAt: 0 };
}

export type CritKind = "none" | "crit" | "mega";

export interface ChopResult {
  amount: number;
  crit: CritKind;
  felled: boolean;
  bonus: number;
  combo: number;
  levelUp: number | null;
}

export function chop(s: GameState, now: number, rng: Rng, auto = false): ChopResult | null {
  // the stump pause is only for your own clicks; helpers just start on the next tree
  if (!auto && now < s.tree.regrowAt) return null;
  const before = levelFor(s.lifetimeWood);

  if (!auto) {
    s.combo = now - s.lastChopAt <= CHOP.comboWindowMs ? Math.min(CHOP.comboMax, s.combo + 1) : 1;
    s.lastChopAt = now;
    if (s.combo > s.stats.bestCombo) s.stats.bestCombo = s.combo;
  }
  const d = derive(s, now);

  const r = rng();
  let crit: CritKind = "none";
  if (!auto && r < CHOP.megaCritChance) crit = "mega";
  else if (d.storm || r < d.critChance) crit = "crit";
  const critMult = crit === "mega" ? CHOP.megaCritMult : crit === "crit" ? CHOP.critMult : 1;

  const share = auto ? CHOP.autoChopShare : 1;
  const amount = d.chopPower * d.frenzy * (auto ? 1 : d.comboMult) * critMult * share;
  earn(s, amount);
  s.stats.chops++;
  if (crit !== "none") s.stats.crits++;
  if (crit === "mega") s.stats.megaCrits++;

  // keep the tree in step with the current axe so a big upgrade doesn't leave a giant HP bar
  if (s.tree.maxHp < d.treeMaxHp * 0.5 || s.tree.maxHp > d.treeMaxHp * 4) {
    const ratio = s.tree.hp / s.tree.maxHp;
    s.tree.maxHp = d.treeMaxHp;
    s.tree.hp = d.treeMaxHp * ratio;
  }
  s.tree.hp -= d.chopPower * critMult * share;

  let felled = false;
  let bonus = 0;
  if (s.tree.hp <= 0) {
    felled = true;
    bonus = d.fellBonus * d.frenzy;
    earn(s, bonus);
    s.stats.treesFelled++;
    s.tree = { ...freshTree(s, now), regrowAt: now + CHOP.stumpMs };
  }

  const after = levelFor(s.lifetimeWood);
  return { amount, crit, felled, bonus, combo: auto ? 0 : s.combo, levelUp: after > before ? after : null };
}

export interface TickResult {
  passive: number;
  autoChops: ChopResult[];
  autoWood: number;
  gnomeCoins: number;
  levelUp: number | null;
}

export function tick(s: GameState, dtSec: number, now: number, rng: Rng): TickResult {
  const before = levelFor(s.lifetimeWood);
  const d = derive(s, now);
  const passive = d.passive * d.frenzy * dtSec;
  earn(s, passive);

  s.autoChopCarry += d.autoChopsPerSec * dtSec;
  let n = Math.floor(s.autoChopCarry);
  s.autoChopCarry -= n;
  const autoChops: ChopResult[] = [];
  let autoWood = 0;
  if (n > 12) {
    // a background tab woke up; settle the bulk without animating every swing
    const avgCrit = 1 + d.critChance * (CHOP.critMult - 1);
    const bulk = (n - 12) * d.chopPower * d.frenzy * CHOP.autoChopShare * avgCrit;
    earn(s, bulk);
    autoWood += bulk;
    n = 12;
  }
  for (let i = 0; i < n; i++) {
    const res = chop(s, now, rng, true);
    if (res) {
      autoChops.push(res);
      autoWood += res.amount + res.bonus;
    }
  }

  let gnomeCoins = 0;
  if (d.gnomeShare > 0 && s.wood > 0) {
    // continuous rate, so one long catch-up tick sells the same share as many short ones
    const w = s.wood * (1 - Math.exp(-d.gnomeShare * dtSec));
    gnomeCoins = sellAmount(s, now, w);
  }

  if (s.combo && now - s.lastChopAt > CHOP.comboWindowMs * 1.5) s.combo = 0;

  const after = levelFor(s.lifetimeWood);
  return { passive, autoChops, autoWood, gnomeCoins, levelUp: after > before ? after : null };
}

// ---------- market ----------

function sellAmount(s: GameState, now: number, wood: number): number {
  wood = Math.min(wood, s.wood);
  if (wood <= 0) return 0;
  const coins = wood * derive(s, now).price;
  s.wood -= wood;
  s.coins += coins;
  s.lifetimeCoins += coins;
  s.stats.woodSold += wood;
  return coins;
}

export function sell(s: GameState, now: number, fraction = 1): { wood: number; coins: number } {
  const wood = s.wood * Math.max(0, Math.min(1, fraction));
  return { wood, coins: sellAmount(s, now, wood) };
}

// ---------- shop ----------

export function upgradeCost(id: UpgradeId, level: number): number {
  const u = UPGRADES.find((x) => x.id === id)!;
  return Math.ceil(u.baseCost * u.growth ** level);
}

export function buildingCost(id: BuildingId, have: number, qty = 1): number {
  const b = BUILDINGS.find((x) => x.id === id)!;
  const g = BUILDING_GROWTH;
  return Math.ceil((b.baseCost * g ** have * (g ** qty - 1)) / (g - 1));
}

export function maxAffordable(id: BuildingId, have: number, coins: number): number {
  const b = BUILDINGS.find((x) => x.id === id)!;
  const g = BUILDING_GROWTH;
  const n = Math.floor(Math.log(1 + (coins * (g - 1)) / (b.baseCost * g ** have)) / Math.log(g));
  let q = Math.max(0, n);
  while (q > 0 && buildingCost(id, have, q) > coins) q--;
  return q;
}

export function buyTool(s: GameState, now: number): boolean {
  const next = TOOLS[s.tool + 1];
  if (!next || s.coins < next.cost) return false;
  s.coins -= next.cost;
  s.tool++;
  const d = derive(s, now);
  const ratio = s.tree.hp / s.tree.maxHp;
  s.tree.maxHp = d.treeMaxHp;
  s.tree.hp = d.treeMaxHp * ratio;
  return true;
}

export function canBuyUpgrade(s: GameState, id: UpgradeId): "ok" | "locked" | "maxed" | "poor" {
  const u = UPGRADES.find((x) => x.id === id)!;
  const level = lv(s, id);
  if (levelFor(s.lifetimeWood) < u.unlockLevel) return "locked";
  if (level >= u.max) return "maxed";
  if (s.coins < upgradeCost(id, level)) return "poor";
  return "ok";
}

export function buyUpgrade(s: GameState, id: UpgradeId): boolean {
  if (canBuyUpgrade(s, id) !== "ok") return false;
  s.coins -= upgradeCost(id, lv(s, id));
  s.upgrades[id] = lv(s, id) + 1;
  return true;
}

export function buyBuilding(s: GameState, id: BuildingId, qty = 1): boolean {
  if (qty < 1) return false;
  const cost = buildingCost(id, owned(s, id), qty);
  if (s.coins < cost) return false;
  s.coins -= cost;
  s.buildings[id] = owned(s, id) + qty;
  return true;
}

/** Everything a save has paid for. Used by the server to check a save adds up. */
export function spentTotal(s: GameState): number {
  let total = 0;
  for (let i = 1; i <= Math.min(s.tool, TOOLS.length - 1); i++) total += TOOLS[i].cost;
  for (const u of UPGRADES) for (let k = 0; k < lv(s, u.id); k++) total += upgradeCost(u.id, k);
  for (const b of BUILDINGS) if (owned(s, b.id)) total += buildingCost(b.id, 0, owned(s, b.id));
  return total;
}

// ---------- zones ----------

export function setZone(s: GameState, id: ZoneId, now: number): boolean {
  const z = ZONES.find((x) => x.id === id);
  if (!z || levelFor(s.lifetimeWood) < z.unlockLevel || s.zone === id) return false;
  s.zone = id;
  s.tree = freshTree(s, now);
  return true;
}

// ---------- golden beaver ----------

export type GoldenKind = "frenzy" | "pile" | "storm";

export function scheduleGolden(s: GameState, now: number, rng: Rng) {
  const cut = 1 - GOLDEN.luckyGapCut * lv(s, "lucky_sapling");
  const gap = (GOLDEN.minGapSec + rng() * (GOLDEN.maxGapSec - GOLDEN.minGapSec)) * cut;
  s.nextGoldenAt = now + gap * 1000;
}

export function pileSize(s: GameState, now: number): number {
  const d = derive(s, now);
  return Math.max(GOLDEN.pileMinChops * d.chopPower, GOLDEN.pilePassiveSec * (d.passive + d.autoChopsPerSec * d.chopPower * CHOP.autoChopShare));
}

export function catchGolden(s: GameState, now: number, rng: Rng): { kind: GoldenKind; amount: number } {
  s.stats.goldenCaught++;
  const r = rng();
  scheduleGolden(s, now, rng);
  if (r < 0.45) {
    s.frenzyUntil = now + GOLDEN.frenzySec * 1000;
    return { kind: "frenzy", amount: GOLDEN.frenzyMult };
  }
  if (r < 0.8) {
    const amount = pileSize(s, now);
    earn(s, amount);
    return { kind: "pile", amount };
  }
  s.stormUntil = now + GOLDEN.stormSec * 1000;
  return { kind: "storm", amount: GOLDEN.stormSec };
}

// ---------- offline ----------

export function offlineEarnings(s: GameState, now: number): { sec: number; wood: number } {
  const sec = Math.min(OFFLINE.maxSec, Math.max(0, (now - s.savedAt) / 1000));
  if (sec < OFFLINE.minSec) return { sec: 0, wood: 0 };
  const d = derive({ ...s, frenzyUntil: 0, stormUntil: 0 }, now);
  const rate = d.passive + d.autoChopsPerSec * d.chopPower * CHOP.autoChopShare;
  return { sec, wood: rate * sec * OFFLINE.share };
}

export function applyOffline(s: GameState, now: number) {
  const res = offlineEarnings(s, now);
  if (res.wood > 0) earn(s, res.wood);
  s.savedAt = now;
  return res;
}

// ---------- anti-cheat ceiling ----------

/**
 * The most wood per second anyone could make with this setup: max click rate,
 * every hit a crit, full combo, frenzy on, trees falling as fast as possible.
 * Real play sits far below this.
 */
export function woodRateCeiling(s: GameState): number {
  const d = derive({ ...s, combo: CHOP.comboMax, frenzyUntil: Infinity, stormUntil: 0 }, 0);
  const clicks = CHOP.maxClicksPerSec;
  const manual = clicks * d.chopPower * d.comboMult * CHOP.critMult;
  const auto = d.autoChopsPerSec * d.chopPower * CHOP.autoChopShare * CHOP.critMult;
  const damagePerSec = (clicks + d.autoChopsPerSec) * d.chopPower * CHOP.critMult;
  const fells = Math.min(1000 / CHOP.stumpMs, damagePerSec / d.treeMaxHp) * d.fellBonus;
  return (manual + auto + fells + d.passive) * GOLDEN.frenzyMult;
}
