"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUILDINGS, CASINO_UNLOCK_LEVEL, CHOP, GOLDEN, OFFLINE, TOOLS, UPGRADES, ZONES, type BuildingId, type UpgradeId, type ZoneId } from "@/game/config";
import * as E from "@/game/engine";
import { fmt, fmtTime } from "@/game/format";
import { fanfare, play, setMuted, unlockAudio } from "@/game/sound";
import { newGame, normalize, type GameState } from "@/game/state";
import { Fx } from "./fx";
import * as Net from "./net";
import { Hud } from "./Hud";
import { ShopPanel, shopBadge } from "./ShopPanel";
import { spriteUrl } from "./sprites";
import { Icon, PxButton } from "./ui";

const SAVE_KEY = "timber-tycoon-save";
const OWNER_KEY = "timber-tycoon-save-owner";
const MUTE_KEY = "timber-tycoon-muted";
const TAB_KEY = "timber-tycoon-tab";

// localStorage throws outright when the browser blocks storage (some iframes, strict privacy modes)
const store = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {
      // full or blocked; keep playing without saving
    }
  },
};

const CHIPS: Record<string, string[]> = {
  oak: ["#c98b4b", "#e3b27a", "#8a5a2b", "#f0cf9a"],
  birch: ["#f2efe4", "#d8cfb8", "#6b5b45", "#fffaf0"],
  maple: ["#c4563a", "#e7a36b", "#8a3a22", "#f3c08a"],
  ancient: ["#8e5bb5", "#d7a8ff", "#4a2a66", "#f2d9ff"],
};
const LEAVES: Record<ZoneId, string[]> = {
  meadow: ["#5aa84a", "#8fd16a", "#3f7d3a"],
  autumn: ["#e2672f", "#f2a03a", "#c43e2a", "#ffd04a"],
  night: ["#4f8d6a", "#9fd8a8", "#2e5e4a"],
};
const BG: Record<ZoneId, string> = { meadow: "bg/meadow", autumn: "bg/autumn", night: "bg/night" };

type PanelId = null | "shop";
interface Banner {
  key: number;
  title: string;
  sub: string;
  tone: "level" | "gold" | "info";
}
interface Golden {
  key: number;
  y: number;
  until: number;
  flip: boolean;
}

function unlockLine(level: number): string {
  const bits: string[] = [];
  for (const u of UPGRADES) if (u.unlockLevel === level) bits.push(`${u.name} is in the shop now`);
  for (const z of ZONES) if (z.unlockLevel === level && level > 1) bits.push(`New place to chop: ${z.name}`);
  if (level === CASINO_UNLOCK_LEVEL) bits.push("The casino just opened");
  return bits[0] ?? `+3% wood on everything`;
}

function loadSave(now: number): GameState {
  try {
    const raw = store.get(SAVE_KEY);
    if (raw) return normalize(JSON.parse(raw), now);
  } catch {
    // corrupted save, start over
  }
  return newGame(now);
}

const centerOf = (el: Element | null) => {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

export default function Game() {
  const sRef = useRef<GameState | null>(null);
  const fx = useMemo(() => new Fx(), []);
  const [, setFrame] = useState(0);
  const [ready, setReady] = useState(false);
  const [panel, setPanel] = useState<PanelId>(null);
  const [muted, setMutedUi] = useState(false);
  const [welcome, setWelcome] = useState<{ sec: number; wood: number } | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [golden, setGolden] = useState<Golden | null>(null);
  const [player, setPlayer] = useState<Net.Player | null>(null);
  const goldenRef = useRef<Golden | null>(null);
  const [elsewhere, setElsewhere] = useState(false);
  const elsewhereRef = useRef(false);
  const tabId = useMemo(() => Math.random().toString(36).slice(2), []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const pawRef = useRef<HTMLImageElement>(null);
  const armRef = useRef<HTMLImageElement>(null);
  const woodRef = useRef<HTMLDivElement>(null);
  const coinRef = useRef<HTMLDivElement>(null);
  const sellRef = useRef<HTMLButtonElement>(null);
  const lastClick = useRef(0);
  const imgs = useRef<{ coin?: HTMLImageElement; log?: HTMLImageElement }>({});
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(() => setFrame((f) => (f + 1) % 1e9), []);

  const save = useCallback(() => {
    const s = sRef.current;
    if (!s || elsewhereRef.current) return;
    s.savedAt = Date.now();
    store.set(SAVE_KEY, JSON.stringify(s));
  }, []);

  const showBanner = useCallback((b: Omit<Banner, "key">, ms = 2600) => {
    setBanner({ ...b, key: Date.now() });
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), ms);
  }, []);

  const celebrateLevel = useCallback(
    (level: number) => {
      fanfare();
      showBanner({ title: `Level ${level}!`, sub: unlockLine(level), tone: "level" });
      const c = centerOf(woodRef.current);
      fx.sparkle(c.x, c.y, 30);
    },
    [fx, showBanner],
  );

  // ---------- boot + game loop ----------
  useEffect(() => {
    const now = Date.now();
    const s = loadSave(now);
    const away = E.applyOffline(s, now);
    sRef.current = s;
    if (away.wood > 0) setWelcome(away);
    if (s.nextGoldenAt < now) E.scheduleGolden(s, now, Math.random);
    // only one tab plays at a time, otherwise two tabs keep overwriting each other's save
    store.set(TAB_KEY, tabId);
    const onStorage = (e: StorageEvent) => {
      if (e.key === TAB_KEY && e.newValue && e.newValue !== tabId) {
        elsewhereRef.current = true;
        setElsewhere(true);
      }
    };
    window.addEventListener("storage", onStorage);
    const m = store.get(MUTE_KEY) === "1";
    setMuted(m);
    setMutedUi(m);
    for (const k of ["coin", "log"] as const) {
      const img = new Image();
      img.src = spriteUrl(k === "coin" ? "currency/coin" : "currency/log");
      imgs.current[k] = img;
    }
    if (canvasRef.current) fx.attach(canvasRef.current);
    fx.font = getComputedStyle(document.body).fontFamily;
    setReady(true);

    let alive = true;
    const adopt = (ns: GameState, withOffline: boolean) => {
      const t = Date.now();
      if (withOffline) {
        const back = E.applyOffline(ns, t);
        setWelcome(back.wood > 0 ? back : null);
      }
      if (ns.nextGoldenAt < t) E.scheduleGolden(ns, t, Math.random);
      sRef.current = ns;
      save();
      refresh();
    };
    void Net.connect().then(async (hello) => {
      if (!alive || !hello) return;
      setPlayer(hello.player);
      const local = sRef.current!;
      const mine = hello.fresh || store.get(OWNER_KEY) === hello.player.id;
      store.set(OWNER_KEY, hello.player.id);
      // savedAt, not lifetime wood: a sale or purchase changes the save without adding wood
      if (mine && local.savedAt > hello.state.savedAt && local.lifetimeWood >= hello.state.lifetimeWood) {
        const r = await Net.push(local, { import: hello.fresh });
        // no state back means the request itself failed; keep playing on the local save
        if (!r.ok && r.state) adopt(r.state, true);
      } else {
        adopt(hello.state, true);
      }
    });

    let last = Date.now();
    let lastUi = 0;
    let lastSave = now;
    let lastPush = now;
    let passivePing = 0;
    let passiveAcc = 0;
    let gnomeAcc = 0;
    let raf = 0;

    const step = () => {
      const st = sRef.current!;
      const t = Date.now();
      if (elsewhereRef.current) {
        // keep the clock moving so "Play here" doesn't pay out the paused time again
        last = t;
        return;
      }
      const dt = Math.min(OFFLINE.maxSec, Math.max(0, (t - last) / 1000));
      last = t;
      const r = E.tick(st, dt, t, Math.random);
      passiveAcc += r.passive;
      gnomeAcc += r.gnomeCoins;

      if (r.autoChops.length && treeRef.current && !document.hidden) {
        const rect = treeRef.current.getBoundingClientRect();
        for (const c of r.autoChops.slice(0, 3)) {
          const x = rect.left + rect.width * (0.35 + Math.random() * 0.3);
          const y = rect.top + rect.height * (0.55 + Math.random() * 0.25);
          fx.text(x, y, `+${fmt(c.amount + c.bonus)}`, { size: 14, color: c.crit !== "none" ? "#ffd23f" : "#d8f0ff", life: 0.7 });
          fx.chips(x, y, 3, CHIPS[st.tree.species] ?? CHIPS.oak, 0.6);
          if (c.felled) fx.text(rect.left + rect.width / 2, rect.top + rect.height * 0.3, `TIMBER! +${fmt(c.bonus)}`, { size: 26, color: "#9cff6a", life: 1.2 });
        }
        play("chopAuto", 1, 60);
        armRef.current?.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(-22deg)" }, { transform: "rotate(0deg)" }], { duration: 220 });
      }

      if (t - passivePing > 1000) {
        passivePing = t;
        if (passiveAcc > 0 && woodRef.current) {
          const c = centerOf(woodRef.current);
          fx.text(c.x + 40, c.y - 10, `+${fmt(passiveAcc)}`, { size: 13, color: "#c9f29b", life: 0.9, rise: 40 });
        }
        if (gnomeAcc > 0 && coinRef.current) {
          const c = centerOf(coinRef.current);
          fx.text(c.x + 40, c.y - 10, `+${fmt(gnomeAcc)}`, { size: 13, color: "#ffd23f", life: 0.9, rise: 40 });
        }
        passiveAcc = 0;
        gnomeAcc = 0;
      }

      if (r.levelUp) celebrateLevel(r.levelUp);

      const g = goldenRef.current;
      if (!g && t >= st.nextGoldenAt && !document.hidden) {
        const ng = { key: t, y: 18 + Math.random() * 45, until: t + GOLDEN.visibleSec * 1000, flip: Math.random() < 0.5 };
        goldenRef.current = ng;
        setGolden(ng);
        play("squeak");
      } else if (g && t > g.until) {
        goldenRef.current = null;
        setGolden(null);
        E.scheduleGolden(st, t, Math.random);
      }

      if (t - lastUi > 100) {
        lastUi = t;
        refresh();
      }
      if (t - lastSave > 5000) {
        lastSave = t;
        save();
      }
      if (t - lastPush > 20000 && Net.signedIn()) {
        lastPush = t;
        void Net.push(st).then((r) => {
          if (!r.ok && r.state && alive) adopt(r.state, false);
        });
      }
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      step();
    };
    raf = requestAnimationFrame(loop);
    // rAF stops in background tabs; keep income ticking slowly there
    const bg = setInterval(() => document.hidden && step(), 1000);
    const onHide = () => {
      if (!document.hidden) return;
      save();
      void Net.push(sRef.current!);
    };
    const onLeave = () => {
      save();
      Net.pushBeacon(sRef.current!);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(bg);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("storage", onStorage);
      alive = false;
      fx.detach();
      save();
    };
  }, [fx, refresh, save, celebrateLevel, tabId]);

  const playHere = useCallback(() => {
    const now = Date.now();
    sRef.current = loadSave(now);
    elsewhereRef.current = false;
    store.set(TAB_KEY, tabId);
    setElsewhere(false);
    refresh();
  }, [tabId, refresh]);

  // ---------- chopping ----------
  const doChop = useCallback(
    (x: number, y: number) => {
      const s = sRef.current;
      if (!s) return;
      const now = Date.now();
      if (now - lastClick.current < 1000 / CHOP.maxClicksPerSec) return;
      lastClick.current = now;
      unlockAudio();

      pawRef.current?.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(-42deg)", offset: 0.3 }, { transform: "rotate(6deg)", offset: 0.7 }, { transform: "rotate(0deg)" }],
        { duration: 170, easing: "ease-out" },
      );
      const species = s.tree.species;
      const res = E.chop(s, now, Math.random);
      if (!res) return;

      const chips = CHIPS[species] ?? CHIPS.oak;
      const comboSize = Math.min(10, res.combo / 8);
      if (res.crit === "mega") {
        fx.text(x, y - 30, `MEGA +${fmt(res.amount)}`, { size: 40, color: "rainbow", life: 1.6, rise: 90 });
        fx.chips(x, y, 26, chips, 1.7);
        fx.sparkle(x, y, 30);
        play("mega");
        stageRef.current?.animate([{ transform: "translate(0,0)" }, { transform: "translate(-9px,6px)" }, { transform: "translate(8px,-6px)" }, { transform: "translate(-5px,3px)" }, { transform: "translate(0,0)" }], { duration: 320 });
      } else if (res.crit === "crit") {
        fx.text(x, y - 26, `+${fmt(res.amount)}`, { size: 30 + comboSize, color: "#ffd23f", life: 1.1, rise: 85 });
        fx.text(x + 30, y - 54, "CRIT!", { size: 14, color: "#ff8a3d", life: 0.8 });
        fx.chips(x, y, 14, chips, 1.3);
        play("crit", 1 + Math.random() * 0.1);
        stageRef.current?.animate([{ transform: "translate(0,0)" }, { transform: "translate(-4px,3px)" }, { transform: "translate(3px,-2px)" }, { transform: "translate(0,0)" }], { duration: 160 });
      } else {
        fx.text(x, y - 20, `+${fmt(res.amount)}`, { size: 18 + comboSize, color: "#fff7e0" });
        fx.chips(x, y, 7, chips);
      }
      play("chop", 1 + Math.min(res.combo, CHOP.comboMax) * 0.007);
      treeRef.current?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-5px) rotate(-0.6deg)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }], { duration: 130 });

      if (res.combo > 0 && res.combo % 25 === 0) {
        fx.text(x, y - 70, `${res.combo} COMBO!`, { size: 22, color: "#ff6a3d", life: 1.1 });
        play("golden", 1 + res.combo / 200);
      }

      const tr = treeRef.current?.getBoundingClientRect();
      if (tr && Math.random() < 0.25) fx.leaves(tr.left + tr.width * 0.15, tr.right - tr.width * 0.15, tr.top + tr.height * 0.12, 2, LEAVES[s.zone]);

      if (res.felled && tr) {
        const cx = tr.left + tr.width / 2;
        fx.text(cx, tr.top + tr.height * 0.35, `TIMBER! +${fmt(res.bonus)}`, { size: 36, color: "#9cff6a", life: 1.5, rise: 60 });
        fx.chips(cx, tr.bottom - tr.height * 0.25, 40, chips, 1.6);
        fx.leaves(tr.left, tr.right, tr.top + tr.height * 0.15, 24, LEAVES[s.zone]);
        play("fell");
        stageRef.current?.animate([{ transform: "translateY(0)" }, { transform: "translateY(7px)" }, { transform: "translateY(-3px)" }, { transform: "translateY(0)" }], { duration: 300 });
      }
      if (res.levelUp) celebrateLevel(res.levelUp);
      refresh();
    },
    [fx, refresh, celebrateLevel],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.code !== "Space" && e.code !== "Enter")) return;
      if ((e.target as HTMLElement)?.closest("button, input, textarea")) return;
      e.preventDefault();
      const r = treeRef.current?.getBoundingClientRect();
      if (r) doChop(r.left + r.width * (0.4 + Math.random() * 0.2), r.top + r.height * (0.55 + Math.random() * 0.2));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doChop]);

  // ---------- selling + shop ----------
  const doSell = useCallback(
    (fraction: number) => {
      const s = sRef.current;
      if (!s) return;
      unlockAudio();
      const r = E.sell(s, Date.now(), fraction);
      const from = centerOf(sellRef.current);
      if (r.coins <= 0) {
        play("deny");
        fx.text(from.x, from.y - 30, "No wood to sell", { size: 14, color: "#ffb4a0" });
        return;
      }
      play("sell");
      fx.text(from.x - 30, from.y - 34, `+${fmt(r.coins)}`, { size: 24, color: "#ffd23f", life: 1.1 });
      const n = Math.min(18, 3 + Math.floor(Math.log10(r.coins + 1) * 2));
      if (imgs.current.coin) fx.fly(imgs.current.coin, from, centerOf(coinRef.current), n, () => play("coin", 0.9 + Math.random() * 0.3, 30));
      refresh();
      save();
    },
    [fx, refresh, save],
  );

  const bought = useCallback(
    (ok: boolean, label?: string) => {
      if (ok) {
        play("buy");
        if (label) showBanner({ title: label, sub: "Nice.", tone: "info" }, 1600);
        save();
      } else play("deny");
      refresh();
    },
    [refresh, save, showBanner],
  );

  const shopActions = useMemo(
    () => ({
      buyTool: () => {
        const s = sRef.current!;
        const ok = E.buyTool(s, Date.now());
        bought(ok, ok ? `${TOOLS[s.tool].name}!` : undefined);
        if (ok) fanfare([392, 523, 659, 784, 1047], 60);
      },
      buyUpgrade: (id: UpgradeId) => bought(E.buyUpgrade(sRef.current!, id)),
      buyBuilding: (id: BuildingId, qty: number) => bought(E.buyBuilding(sRef.current!, id, qty)),
      setZone: (id: ZoneId) => {
        const ok = E.setZone(sRef.current!, id, Date.now());
        if (ok) play("whoosh");
        bought(ok);
      },
    }),
    [bought],
  );

  const catchGoldenBeaver = useCallback(
    (e: React.PointerEvent) => {
      const s = sRef.current;
      if (!s || !goldenRef.current) return;
      e.stopPropagation();
      unlockAudio();
      const now = Date.now();
      const r = E.catchGolden(s, now, Math.random);
      goldenRef.current = null;
      setGolden(null);
      fx.sparkle(e.clientX, e.clientY, 50);
      play("golden");
      fanfare([784, 988, 1175, 1568], 55);
      if (r.kind === "frenzy") showBanner({ title: "FRENZY!", sub: `x${GOLDEN.frenzyMult} wood for ${GOLDEN.frenzySec} seconds. Go go go.`, tone: "gold" });
      else if (r.kind === "pile") {
        showBanner({ title: "Log pile!", sub: `The golden beaver left you ${fmt(r.amount)} wood.`, tone: "gold" });
        fx.text(e.clientX, e.clientY - 30, `+${fmt(r.amount)}`, { size: 34, color: "#ffd23f", life: 1.6 });
      } else showBanner({ title: "CHOP STORM!", sub: `Every hit is a crit for ${GOLDEN.stormSec} seconds.`, tone: "gold" });
      refresh();
    },
    [fx, refresh, showBanner],
  );

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    setMutedUi(m);
    store.set(MUTE_KEY, m ? "1" : "0");
    if (!m) {
      unlockAudio();
      setTimeout(() => play("click"), 50);
    }
  };

  // ---------- render ----------
  const s = sRef.current;
  const now = Date.now();
  const d = s ? E.derive(s, now) : null;
  const stump = s ? now < s.tree.regrowAt : false;
  const tool = s ? TOOLS[Math.min(s.tool, TOOLS.length - 1)] : TOOLS[0];
  const badge = s ? shopBadge(s) : 0;

  return (
    <div className={`game zone-${s?.zone ?? "meadow"} ${d && d.frenzy > 1 ? "frenzy-on" : ""}`}>
      <canvas ref={canvasRef} className="fx" aria-hidden />
      {!ready || !s || !d ? (
        <div className="loading">Sharpening the axe…</div>
      ) : (
        <>
          <Hud s={s} d={d} now={now} woodRef={woodRef} coinRef={coinRef} />

          <main ref={stageRef} className="stage" style={{ backgroundImage: `url(${spriteUrl(BG[s.zone])})` }}>
            <div className="tree-label">
              <span>{s.tree.species === "ancient" ? "Ancient tree" : `${s.tree.species[0].toUpperCase()}${s.tree.species.slice(1)} tree`}</span>
              <div className="bar hp">
                <div className="bar-fill hp" style={{ width: `${stump ? 0 : Math.max(0, (s.tree.hp / s.tree.maxHp) * 100)}%` }} />
              </div>
              <small>{stump ? "regrowing…" : `${fmt(Math.max(0, s.tree.hp))} / ${fmt(s.tree.maxHp)}`}</small>
            </div>

            <div
              ref={treeRef}
              className="tree"
              data-testid="tree"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                doChop(e.clientX, e.clientY);
              }}
            >
              {stump ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="tree-img stump" src={spriteUrl("tree/stump")} alt="stump" draggable={false} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={s.stats.treesFelled} className="tree-img grow" src={spriteUrl(`tree/${s.tree.species}`)} alt={`${s.tree.species} tree`} draggable={false} />
              )}
              {(s.upgrades.robo_arm ?? 0) > 0 && (
                // eslint-disable-next-line @next/next/no-img-element
                <img ref={armRef} className="robo-arm" src={spriteUrl("shop/robot_arm")} alt="" draggable={false} />
              )}
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={pawRef} className={`paw ${tool.id}`} src={spriteUrl(`paw/${tool.id}`)} alt="your beaver paw" draggable={false} />

            <div className="camp" aria-label="Your crew">
              {BUILDINGS.filter((b) => (s.buildings[b.id] ?? 0) > 0).map((b) => (
                <div key={b.id} className="camp-item" title={b.name}>
                  <Icon name={b.icon} size={36} />
                  <span>{s.buildings[b.id]}</span>
                </div>
              ))}
            </div>

            {golden && (
              <button
                key={golden.key}
                className={`golden ${golden.flip ? "flip" : ""}`}
                style={{ top: `${golden.y}%`, animationDuration: `${GOLDEN.visibleSec}s` }}
                onPointerDown={catchGoldenBeaver}
                aria-label="Golden beaver! Click it"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={spriteUrl("beaver/golden")} alt="" draggable={false} />
              </button>
            )}

            {banner && (
              <div key={banner.key} className={`banner ${banner.tone}`}>
                <b>{banner.title}</b>
                <span>{banner.sub}</span>
              </div>
            )}

            {s.stats.chops === 0 && !welcome && <div className="hint">Click the tree. Or tap space.</div>}
          </main>

          <nav className="rail">
            {player && (
              <div className="who" title={`Signed in as ${player.name}`}>
                {player.name}
              </div>
            )}
            <PxButton ref={sellRef} tone="green" className="rail-btn sell" onClick={() => doSell(1)} data-testid="sell">
              <Icon name="currency/coin" size={22} />
              <span>SELL</span>
              <small>+{fmt(s.wood * d.price)}</small>
            </PxButton>
            <button className="half" onClick={() => doSell(0.5)}>
              sell half
            </button>
            <PxButton
              tone="wood"
              className={`rail-btn ${panel === "shop" ? "on" : ""}`}
              onClick={() => {
                unlockAudio();
                play("click");
                setPanel(panel === "shop" ? null : "shop");
              }}
              data-testid="open-shop"
            >
              <Icon name="shop/money_bag" size={22} />
              <span>SHOP</span>
              {badge > 0 && <i className="badge">{badge}</i>}
            </PxButton>
            <div className="rail-spacer" />
            <button className="mute" onClick={toggleMute} aria-label={muted ? "Turn sound on" : "Turn sound off"}>
              {muted ? "SFX off" : "SFX on"}
            </button>
          </nav>

          {panel === "shop" && <ShopPanel s={s} now={now} onClose={() => setPanel(null)} act={shopActions} />}

          {elsewhere && (
            <div className="modal-back">
              <div className="modal">
                <h2>Open in another tab</h2>
                <p>You&apos;re chopping in another tab, so this one is paused to keep your save safe.</p>
                <PxButton tone="green" onClick={playHere}>
                  Play here instead
                </PxButton>
              </div>
            </div>
          )}
          {welcome && (
            <div className="modal-back" onClick={() => setWelcome(null)}>
              <div className="modal">
                <Icon name="beaver/mascot" size={72} />
                <h2>Welcome back!</h2>
                <p>
                  You were gone for <b>{fmtTime(welcome.sec)}</b>. Your crew kept chopping and stacked up
                </p>
                <p className="modal-big">
                  <Icon name="currency/log" size={28} /> {fmt(welcome.wood)} wood
                </p>
                <PxButton tone="green" onClick={() => setWelcome(null)}>
                  Back to work
                </PxButton>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
