/**
 * Plays the game with a few kinds of hackers and prints how fast they progress.
 * Use it to check pacing after touching numbers in src/game/config.ts.
 *
 *   npm run sim            # all personas, 36 hours
 *   npm run sim -- 8       # just the first 8 hours
 */
import { BUILDINGS, CASINO_UNLOCK_LEVEL, TOOLS, UPGRADES, ZONES } from "../src/game/config";
import { applyOutcome, roll, spinCost } from "../src/game/casino";
import * as E from "../src/game/engine";
import { newGame, type GameState } from "../src/game/state";

interface Persona {
  name: string;
  /** clicks per second while playing */
  cps: number;
  /** seconds of play, then seconds away, repeating */
  on: number;
  off: number;
  /** leaves the tab open while away, so the game keeps ticking */
  tabOpen: boolean;
  /** buys whatever adds the most wood per coin, instead of the cheapest thing */
  minmax: boolean;
  /** chance of catching a golden beaver while playing */
  catchRate: number;
}

export const PERSONAS: Persona[] = [
  { name: "prompt-gap (2 min play, 3 min wait)", cps: 6, on: 120, off: 180, tabOpen: false, minmax: false, catchRate: 0.6 },
  { name: "tab open in the background", cps: 5, on: 90, off: 600, tabOpen: true, minmax: false, catchRate: 0.4 },
  { name: "AFK (30 s every 30 min)", cps: 5, on: 30, off: 1800, tabOpen: false, minmax: false, catchRate: 0.3 },
  { name: "auto-clicker (20/s, always on)", cps: 20, on: 3600, off: 0, tabOpen: true, minmax: false, catchRate: 0 },
  { name: "min-maxer (10/s, plays a lot)", cps: 10, on: 600, off: 300, tabOpen: false, minmax: true, catchRate: 0.9 },
];

function seeded(seed: number) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

type Buy = { label: string; cost: number; gain: number; go: () => boolean };

function options(s: GameState, now: number): Buy[] {
  const out: Buy[] = [];
  const base = E.derive(s, now);
  const rate = (st: GameState) => {
    const d = E.derive(st, now);
    return d.passive + d.autoChopsPerSec * d.chopPower * 0.5 + 6 * d.chopPower * d.comboMult;
  };
  const r0 = rate(s);
  const lvl = E.levelFor(s.lifetimeWood);
  const next = TOOLS[s.tool + 1];
  if (next) {
    const t = { ...s, upgrades: { ...s.upgrades }, buildings: { ...s.buildings } };
    t.tool++;
    out.push({ label: next.name, cost: next.cost, gain: rate(t) - r0, go: () => E.buyTool(s, now) });
  }
  for (const u of UPGRADES) {
    const have = s.upgrades[u.id] ?? 0;
    if (lvl < u.unlockLevel || have >= u.max) continue;
    const t = { ...s, upgrades: { ...s.upgrades }, buildings: { ...s.buildings } };
    t.upgrades[u.id] = have + 1;
    out.push({ label: u.name, cost: E.upgradeCost(u.id, have), gain: Math.max(rate(t) - r0, r0 * 0.02), go: () => E.buyUpgrade(s, u.id) });
  }
  for (const b of BUILDINGS) {
    const have = s.buildings[b.id] ?? 0;
    const t = { ...s, upgrades: { ...s.upgrades }, buildings: { ...s.buildings } };
    t.buildings[b.id] = have + 1;
    out.push({ label: b.name, cost: E.buildingCost(b.id, have), gain: rate(t) - r0, go: () => E.buyBuilding(s, b.id) });
  }
  void base;
  return out;
}

/** average payout per coin bet, leaving out the 777 prizes */
function rtp(s: GameState, now: number, n = 20_000) {
  const rng = seeded(7);
  const bet = spinCost(s, now);
  const price = E.derive(s, now).priceBase;
  let back = 0;
  let spins = 0;
  for (let i = 0; i < n; i++) {
    const t = { ...s, upgrades: { ...s.upgrades }, buildings: { ...s.buildings } };
    const { outcome } = roll(rng);
    if (outcome === "jackpot") continue;
    const r = applyOutcome(t, outcome, bet, now, rng);
    back += r.coins + r.wood * price + (r.upgrade?.value ?? 0);
    spins += r.freeSpins;
  }
  // a free spin is worth one more spin at the same odds
  const per = back / (n * bet);
  return (per / (1 - (spins / n))).toFixed(2);
}

function shop(s: GameState, now: number, p: Persona, log: (what: string) => void) {
  E.sell(s, now);
  for (let guard = 0; guard < 200; guard++) {
    const opts = options(s, now);
    const affordable = opts.filter((o) => o.cost <= s.coins);
    if (!affordable.length) break;
    const pick = p.minmax
      ? affordable.sort((a, b) => b.gain / b.cost - a.gain / a.cost)[0]
      : affordable.sort((a, b) => a.cost - b.cost)[0];
    if (!pick.go()) break;
    log(pick.label);
  }
  for (const z of [...ZONES].reverse()) if (E.setZone(s, z.id, now)) break;
}

const fmtT = (sec: number) => (sec < 120 ? `${Math.round(sec)}s` : sec < 3600 ? `${Math.round(sec / 60)}m` : `${(sec / 3600).toFixed(1)}h`);
const fmtN = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(0));

export function run(p: Persona, hours: number, seed = 1, quiet = false) {
  const rng = seeded(seed);
  const s = newGame(0);
  const end = hours * 3600 * 1000;
  let now = 0;
  const firsts = new Map<string, number>();
  let lastBuy = 0;
  let worstGap = 0;
  let worstGapAt = 0;
  const rtps: string[] = [];
  let buys = 0;
  let playSec = 0;
  const checkpoints = [1 / 12, 1 / 6, 0.25, 0.5, 1, 2, 4, 8, 12, 24, 36].filter((h) => h <= hours);
  const snaps: string[] = [];
  const log = (what: string) => {
    buys++;
    if (!firsts.has(what)) firsts.set(what, now / 1000);
    lastBuy = playSec;
  };
  const snap = () => {
    while (checkpoints.length && now >= checkpoints[0] * 3600_000) {
      if ([4, 12, 36].includes(checkpoints[0]) && casinoAt !== null) rtps.push(`${checkpoints[0]}h ${rtp(s, now)}`);
      snaps.push(`${fmtT(checkpoints.shift()! * 3600)}: Lv ${E.levelFor(s.lifetimeWood)}, ${fmtN(s.lifetimeWood)} wood`);
      if (process.env.SIM_DEBUG) {
        const d = E.derive(s, now);
        console.log(fmtT(now / 1000), { tool: d.tool.name, chop: fmtN(d.chopPower), passive: fmtN(d.passive), auto: d.autoChopsPerSec, fell: fmtN(d.fellBonus), hp: fmtN(d.treeMaxHp), up: JSON.stringify(s.upgrades), b: JSON.stringify(s.buildings) });
      }
    }
  };
  E.scheduleGolden(s, 0, rng);
  let casinoAt: number | null = null;

  while (now < end) {
    // playing
    const stop = Math.min(end, now + p.on * 1000);
    while (now < stop) {
      const step = 250;
      now += step;
      playSec += step / 1000;
      const clicks = p.cps * (step / 1000) + (rng() < (p.cps * (step / 1000)) % 1 ? 1 : 0);
      for (let i = 0; i < Math.floor(clicks); i++) E.chop(s, now - step + (i * step) / clicks, rng);
      E.tick(s, step / 1000, now, rng);
      if (now >= s.nextGoldenAt) {
        if (rng() < p.catchRate) E.catchGolden(s, now, rng);
        E.scheduleGolden(s, now, rng);
      }
      if (now % 2000 < step) shop(s, now, p, log);
      if (playSec - lastBuy > worstGap) {
        worstGap = playSec - lastBuy;
        worstGapAt = now / 1000;
      }
      if (casinoAt === null && E.levelFor(s.lifetimeWood) >= CASINO_UNLOCK_LEVEL) {
        casinoAt = now / 1000;
        rtps.push(`at unlock ${rtp(s, now)}`);
      }
      snap();
    }
    if (now >= end || p.off === 0) continue;
    // away
    s.savedAt = now;
    const back = Math.min(end, now + p.off * 1000);
    if (p.tabOpen) {
      while (now < back) {
        now += 5000;
        E.tick(s, 5, now, rng);
        snap();
      }
    } else {
      now = back;
      E.applyOffline(s, now);
      snap();
    }
    if (s.nextGoldenAt < now) E.scheduleGolden(s, now, rng);
    shop(s, now, p, log);
    lastBuy = playSec; // coming back with a pile of offline coins resets the boredom clock
  }
  if (casinoAt === null && E.levelFor(s.lifetimeWood) >= CASINO_UNLOCK_LEVEL) casinoAt = now / 1000;

  const result = { casinoAt, worstGap, firsts, s };
  if (quiet) return result;
  const at = (k: string) => (firsts.has(k) ? fmtT(firsts.get(k)!) : "never");
  console.log(`\n## ${p.name}`);
  console.log(`  first buy ${fmtT([...firsts.values()][0] ?? 0)} | casino (Lv ${CASINO_UNLOCK_LEVEL}) ${casinoAt === null ? "never" : fmtT(casinoAt)} | ${buys} purchases`);
  console.log(`  longest stretch of play with nothing bought: ${Math.round(worstGap)}s (ending at ${fmtT(worstGapAt)})`);
  console.log(`  casino return per coin bet, not counting 777: ${rtps.join(", ")}`);
  console.log(`  tools: ${TOOLS.slice(1).map((t) => `${t.name.replace(" Axe", "")} ${at(t.name)}`).join(", ")}`);
  console.log(`  ${snaps.join(" | ")}`);
  return result;
}

if (process.argv[1]?.endsWith("simulate.ts")) {
  const hours = Number(process.argv[2] ?? 36);
  const only = process.argv[3];
  for (const p of PERSONAS) if (!only || p.name.startsWith(only)) run(p, hours);
}
