import { applyOutcome, casinoOpen, PAYOUT, roll, spinCost, type Reward } from "@/game/casino";
import { CASINO_UNLOCK_LEVEL } from "@/game/config";
import { levelFor, xpForLevel } from "@/game/engine";
import { normalize, type GameState } from "@/game/state";
import { PRIZE_SHELF } from "@/server/prizes";

// Browser-only stand-in for /api, for the static GitHub Pages build. Nothing here is trusted or
// shared: the casino rolls in your tab, prizes are pretend and the leaderboard is made up.

export const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

const PLAYER_KEY = "timber-demo-player";
const CASINO_KEY = "timber-demo-casino";

type Prize = { name: string; code: string; redeemed: boolean };
type Casino = { freeSpins: number; prizes: Prize[] };

const read = <T>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // storage blocked: the demo still runs, it just forgets on reload
  }
};

let last: GameState | null = null;
export const remember = (s: GameState) => (last = structuredClone(s));

export function player(picked?: string): { id: string; name: string } | null {
  if (picked) {
    const p = { id: `demo-${picked.toLowerCase()}`, name: picked };
    write(PLAYER_KEY, p);
    return p;
  }
  return read<{ id: string; name: string } | null>(PLAYER_KEY, null);
}

const casino = () => read<Casino>(CASINO_KEY, { freeSpins: 0, prizes: [] });
export const casinoInfo = () => casino();

function claimCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(8));
  let out = "";
  for (let i = 0; i < 8; i++) out += abc[b[i] % abc.length];
  return `DEMO-${out.slice(0, 4)}-${out.slice(4)}`;
}

export function spin(state: GameState) {
  const s = normalize(structuredClone(state), Date.now());
  const now = Date.now();
  if (!casinoOpen(s)) return { ok: false as const, error: "locked" };
  const c = casino();
  const bet = spinCost(s, now);
  const free = c.freeSpins > 0;
  if (!free) {
    if (s.coins < bet) return { ok: false as const, error: "poor" };
    s.coins -= bet;
  } else c.freeSpins--;
  s.stats.spins++;
  const { outcome, reels } = roll(Math.random);
  let reward: Reward = { coins: 0, wood: 0, freeSpins: 0, upgrade: null };
  let prize: { name: string; code: string } | null = null;
  if (outcome === "jackpot") {
    const total = PRIZE_SHELF.reduce((a, p) => a + p.weight, 0);
    let pick = Math.random() * total;
    const p = PRIZE_SHELF.find((x) => (pick -= x.weight) < 0) ?? PRIZE_SHELF[0];
    prize = { name: p.name, code: claimCode() };
    c.prizes.unshift({ ...prize, redeemed: false });
  } else reward = applyOutcome(s, outcome, bet, now, Math.random);
  c.freeSpins += reward.freeSpins;
  s.savedAt = now;
  write(CASINO_KEY, c);
  last = s;
  return { ok: true as const, state: s, reels, outcome, bet, free, reward, prize, freeSpins: c.freeSpins };
}

export function boost(what: "casino" | "coins" | "spins") {
  const s = last ? structuredClone(last) : null;
  if (!s) return null;
  const now = Date.now();
  const c = casino();
  let coins = 0;
  let wood = 0;
  if (what === "casino") {
    const need = xpForLevel(CASINO_UNLOCK_LEVEL) + 1;
    if (s.lifetimeWood < need) wood = need - s.lifetimeWood;
    s.lifetimeWood += wood;
    coins = spinCost(s, now) * 20;
  } else if (what === "coins") coins = spinCost(s, now) * 20;
  else c.freeSpins += 10;
  write(CASINO_KEY, c);
  return { freeSpins: c.freeSpins, added: { coins, wood } };
}

// made-up rivals so the board has something on it
const RIVALS: [string, number][] = [
  ["maya.codes", 48_200_000],
  ["Priya S", 21_700_000],
  ["jonah", 9_800_000],
  ["Theo Tremblay", 4_350_000],
  ["sam_k", 1_920_000],
  ["Aisha", 860_000],
  ["Liam from UofT", 412_000],
  ["Zoe", 133_000],
  ["kevin.dev", 58_000],
  ["Nora", 9_400],
];

export function leaderboard() {
  const me = player();
  const rows = RIVALS.map(([name, wood]) => ({ name, wood, you: false }));
  if (me) rows.push({ name: me.name, wood: last?.lifetimeWood ?? 0, you: true });
  rows.sort((a, b) => b.wood - a.wood);
  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1, level: levelFor(r.wood) }));
  const mine = ranked.find((r) => r.you);
  return {
    top: ranked.slice(0, 10),
    me: mine ? { rank: mine.rank, name: mine.name, wood: mine.wood, level: mine.level } : null,
    players: 1_284,
  };
}

export { PAYOUT };
