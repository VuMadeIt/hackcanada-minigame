import { normalize, type GameState } from "@/game/state";
import type { UpgradeId } from "@/game/config";

// Talks to /api. Everything still works without it; you just play on a local save.

const SESSION_KEY = "timber-tycoon-session";

export interface Player {
  id: string;
  name: string;
}

interface Hello {
  session: string;
  player: Player;
  state: unknown;
  rev: number;
  fresh: boolean;
  freeSpins: number;
  testTools?: boolean;
}

let session: string | null = null;

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      // blocked storage: the session just lasts until reload
    }
  },
};
let rev = 0;
let saving = false;

let devLogin = false;
let testTools = false;

export const signedIn = () => session !== null;
/** No dashboard token, but this server lets you pick a name (local and test servers). */
export const canPickName = () => !session && devLogin;
export const hasTestTools = () => session !== null && testTools;
export const authHeader = (): Record<string, string> => (session ? { authorization: `Bearer ${session}` } : {});

async function post<T>(path: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

/** Waits briefly for the dashboard to hand over a token if we're inside its iframe. */
function tokenFromParent(ms: number): Promise<string | null> {
  if (window.parent === window) return Promise.resolve(null);
  return new Promise((resolve) => {
    const done = (v: string | null) => {
      window.removeEventListener("message", onMsg);
      clearTimeout(timer);
      resolve(v);
    };
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; token?: string } | null;
      if (d && d.type === "timber:identity" && typeof d.token === "string") done(d.token);
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "timber:ready" }, "*");
    const timer = setTimeout(() => done(null), ms);
  });
}

export type Connected = { player: Player; state: GameState; fresh: boolean; freeSpins: number };

export async function connect(pickedName?: string): Promise<Connected | null> {
  const url = new URL(window.location.href);
  const token = pickedName ? null : (url.searchParams.get("t") ?? (await tokenFromParent(1500)));
  const devName = pickedName ?? url.searchParams.get("dev");
  if (token || devName) {
    url.searchParams.delete("t");
    window.history.replaceState(null, "", url.toString());
  }
  // inside the dashboard, only trust a token it just handed us; a stored session could belong to
  // whoever was logged in before
  const embedded = window.parent !== window;
  session = token || devName || embedded ? null : ls.get(SESSION_KEY);
  if (embedded && !token && !devName) {
    ls.set(SESSION_KEY, null);
    return null;
  }
  try {
    const { status, data } = await post<Hello & { devLogin?: boolean }>("/api/session", token ? { token } : devName ? { devName } : {});
    if (status !== 200) {
      session = null;
      devLogin = status === 401 && !embedded && data.devLogin === true;
      if (status === 401) ls.set(SESSION_KEY, null);
      return null;
    }
    session = data.session;
    rev = data.rev;
    testTools = data.testTools === true;
    ls.set(SESSION_KEY, data.session);
    return { player: data.player, state: normalize(data.state, Date.now()), fresh: data.fresh, freeSpins: data.freeSpins };
  } catch {
    session = null;
    return null;
  }
}

export type PushResult = { ok: true } | { ok: false; state?: GameState; reason?: string };

export async function push(state: GameState, opts: { import?: boolean } = {}): Promise<PushResult> {
  if (!session || saving) return { ok: true };
  saving = true;
  try {
    const { status, data } = await post<{ rev: number; state?: unknown; reason?: string }>("/api/save", {
      state,
      rev,
      import: opts.import,
    });
    if (status === 200) {
      rev = data.rev;
      return { ok: true };
    }
    if (status === 409 && data.state) {
      rev = data.rev;
      return { ok: false, state: normalize(data.state, Date.now()), reason: data.reason };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  } finally {
    saving = false;
  }
}

/** Fire-and-forget save for when the tab is closing. */
export function pushBeacon(state: GameState) {
  if (!session) return;
  void fetch("/api/save", {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json", ...authHeader() },
    body: JSON.stringify({ state, rev }),
  }).catch(() => {});
}

export const setRev = (r: number) => (rev = r);

export interface SpinReply {
  ok: boolean;
  error?: string;
  reason?: string;
  state?: unknown;
  rev?: number;
  reels?: [string, string, string];
  outcome?: string;
  bet?: number;
  free?: boolean;
  reward?: { coins: number; wood: number; freeSpins: number; upgrade: { id: UpgradeId; name: string; value: number } | null };
  prize?: { name: string; code: string } | null;
  freeSpins?: number;
}

export async function spin(state: GameState): Promise<SpinReply & { newState?: GameState }> {
  if (!session) return { ok: false, error: "offline" };
  try {
    const { data } = await post<SpinReply>("/api/spin", { state, rev });
    if (typeof data.rev === "number") rev = data.rev;
    return { ...data, newState: data.state ? normalize(data.state, Date.now()) : undefined };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function casinoInfo(): Promise<{ freeSpins: number; prizes: { name: string; code: string; redeemed: boolean }[] } | null> {
  if (!session) return null;
  try {
    const res = await fetch("/api/casino", { headers: authHeader() });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export interface Board {
  top: { rank: number; name: string; wood: number; level: number; you: boolean }[];
  me: { rank: number; name: string; wood: number; level: number } | null;
  players: number;
}

export async function leaderboard(): Promise<Board | null> {
  try {
    const res = await fetch("/api/leaderboard", { headers: authHeader(), cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export type BoostKind = "casino" | "coins" | "spins";

/** Test-server only: unlock the casino, add coins or free spins. */
export async function boost(what: BoostKind): Promise<{ state: GameState; freeSpins: number } | null> {
  if (!session) return null;
  try {
    const { status, data } = await post<{ state?: unknown; rev?: number; freeSpins?: number }>("/api/dev/boost", { what });
    if (status !== 200 || !data.state || typeof data.rev !== "number") return null;
    rev = data.rev;
    return { state: normalize(data.state, Date.now()), freeSpins: data.freeSpins ?? 0 };
  } catch {
    return null;
  }
}
