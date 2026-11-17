// Every sound is synthesized with ZzFX, so there are no audio files to ship or license.
// ZzFX creates an AudioContext when imported, so it is only loaded in the browser after a click.

type Params = (number | undefined)[];

const SOUNDS = {
  chop: [1.1, 0.05, 140, 0.005, 0.02, 0.09, 4, 1.4, -6, , , , , 0.7, , 0.1, , 0.55, 0.02],
  chopAuto: [0.35, 0.05, 180, 0.005, 0.01, 0.06, 4, 1.4, -6, , , , , 0.6, , 0.1, , 0.5, 0.02],
  crit: [1.4, 0.05, 520, 0.005, 0.04, 0.18, 1, 1.8, , , 380, 0.04, , , , , , 0.75, 0.04],
  mega: [1.8, 0, 260, 0.01, 0.2, 0.5, 1, 1.5, , , 520, 0.05, 0.08, , , , 0.05, 0.8, 0.1],
  fell: [2, 0.05, 70, 0.02, 0.25, 0.6, 4, 2.4, -1.2, , , , , 1, , 0.3, 0.12, 0.45, 0.2],
  sell: [1, 0.02, 1500, , 0.05, 0.2, 1, 1.8, , , 760, 0.05],
  coin: [0.5, 0.05, 1900, , 0.02, 0.08, 1, 1.8, , , 600, 0.03],
  buy: [1, 0.02, 520, , 0.06, 0.16, , 1.4, , , 260, 0.06],
  deny: [0.9, 0.02, 140, , 0.04, 0.12, 2, 0.6, , , , , , , , , , 0.5],
  click: [0.6, 0.02, 820, , 0.01, 0.03, , 2.2],
  golden: [1.3, 0.02, 880, 0.02, 0.15, 0.35, , 1.9, , , 660, 0.07, 0.07, , , , , 0.7, 0.05],
  chime: [0.7, 0.05, 1320, 0.04, 0.25, 0.6, , 1.6, , , 440, 0.12, 0.12, , , , , 0.6, 0.04],
  reel: [0.45, 0.02, 380, , 0.01, 0.02, 3, 2.5, , , , , , 0.3],
  reelStop: [0.9, 0.02, 220, , 0.02, 0.08, 4, 1.5, , , , , , 0.5],
  win: [1.2, 0.02, 660, 0.02, 0.2, 0.3, , 1.7, , , 330, 0.08, 0.06],
  lose: [0.8, 0.02, 300, 0.02, 0.1, 0.3, 1, 1.2, -2, , , , 0.1],
  whoosh: [0.5, 0.05, 300, 0.05, 0.05, 0.15, 4, 0, 5, , , , , 2],
} satisfies Record<string, Params>;

export type SoundName = keyof typeof SOUNDS;

/** Each sound belongs to one slider in the sound menu. */
export type SoundGroup = "tree" | "coins" | "casino";
export const SOUND_GROUPS: { id: SoundGroup; label: string; sample: SoundName }[] = [
  { id: "tree", label: "Chopping", sample: "chop" },
  { id: "coins", label: "Coins & shop", sample: "coin" },
  { id: "casino", label: "Casino", sample: "reelStop" },
];
const GROUP: Record<SoundName, SoundGroup> = {
  chop: "tree",
  chopAuto: "tree",
  crit: "tree",
  mega: "tree",
  fell: "tree",
  golden: "tree",
  chime: "tree",
  sell: "coins",
  coin: "coins",
  buy: "coins",
  deny: "coins",
  click: "coins",
  reel: "casino",
  reelStop: "casino",
  win: "casino",
  lose: "casino",
  whoosh: "casino",
};

export type Volumes = { master: number } & Record<SoundGroup, number>;
const VOLUME_KEY = "timber-tycoon-volume";
const DEFAULT_VOLUMES: Volumes = { master: 1, tree: 1, coins: 1, casino: 1 };
let volumes: Volumes = { ...DEFAULT_VOLUMES };

const clamp01 = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

/** Reads saved slider levels; anything missing or broken falls back to full volume. */
export function parseVolumes(raw: string | null): Volumes {
  let saved: Record<string, unknown> = {};
  try {
    const v: unknown = raw ? JSON.parse(raw) : {};
    if (v && typeof v === "object") saved = v as Record<string, unknown>;
  } catch {
    // a broken value just means default levels
  }
  const out = { ...DEFAULT_VOLUMES };
  for (const k of Object.keys(out) as (keyof Volumes)[]) out[k] = clamp01(saved[k], out[k]);
  return out;
}

export function loadVolumes(): Volumes {
  try {
    volumes = parseVolumes(localStorage.getItem(VOLUME_KEY));
  } catch {
    volumes = { ...DEFAULT_VOLUMES };
  }
  return { ...volumes };
}

export function setVolume(key: keyof Volumes, v: number): Volumes {
  volumes = { ...volumes, [key]: clamp01(v, volumes[key]) };
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(volumes));
  } catch {
    // storage blocked: the level still applies until the tab closes
  }
  return { ...volumes };
}

/** How loud a sound plays right now, 0 to 1, before ZzFX's own master volume. */
export function gainFor(group: SoundGroup, v: Volumes = volumes) {
  return v.master * v[group];
}

export function groupOf(name: SoundName) {
  return GROUP[name];
}

type Zzfx = typeof import("zzfx");
let lib: Zzfx | null = null;
let loading: Promise<void> | null = null;
let muted = false;
const lastPlayed: Partial<Record<SoundName, number>> = {};

export function unlockAudio() {
  if (lib || loading || typeof window === "undefined") return;
  loading = import("zzfx").then((m) => {
    lib = m;
    lib.ZZFX.volume = 0.25;
    if (lib.ZZFX.audioContext.state === "suspended") void lib.ZZFX.audioContext.resume();
  });
}

export function setMuted(m: boolean) {
  muted = m;
}

export function isMuted() {
  return muted;
}

/** pitch: 1 is normal. minGapMs stops 20 chops a second turning into mush. */
export function play(name: SoundName, pitch = 1, minGapMs = 18) {
  if (muted || !lib) return;
  const gain = gainFor(GROUP[name]);
  if (gain <= 0) return;
  const now = performance.now();
  if (now - (lastPlayed[name] ?? 0) < minGapMs) return;
  lastPlayed[name] = now;
  const p = [...SOUNDS[name]] as number[];
  p[0] = (p[0] ?? 1) * gain;
  p[2] = (p[2] ?? 220) * pitch;
  try {
    lib.zzfx(...p);
  } catch {
    // audio can fail if the tab loses its audio device; the game shouldn't care
  }
}

/** a quick rising arpeggio, for level ups and big wins */
export function fanfare(notes = [523, 659, 784, 1047], gap = 70, group: SoundGroup = "coins") {
  notes.forEach((f, i) =>
    setTimeout(() => {
      const gain = gainFor(group);
      if (muted || !lib || gain <= 0) return;
      lib.zzfx(...[gain, 0.02, f, 0.01, 0.08, 0.2, 0, 1.6, , , , , , , , , , 0.7, 0.04]);
    }, i * gap),
  );
}
