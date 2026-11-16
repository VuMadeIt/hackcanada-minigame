import { CHOP, GOLDEN } from "@/game/config";
import { levelProgress, marketFactor, type Derived } from "@/game/engine";
import { fmt, fmtInt } from "@/game/format";
import type { GameState } from "@/game/state";
import type { Ref } from "react";
import { Icon } from "./ui";

function Sparkline({ now }: { now: number }) {
  const pts: string[] = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const f = marketFactor(now - (n - i) * 4500);
    pts.push(`${(i / n) * 100},${30 - ((f - 0.64) / 0.72) * 28}`);
  }
  return (
    <svg className="spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts.join(" ")} />
    </svg>
  );
}

export function Hud({
  s,
  d,
  now,
  woodRef,
  coinRef,
}: {
  s: GameState;
  d: Derived;
  now: number;
  woodRef: Ref<HTMLDivElement>;
  coinRef: Ref<HTMLDivElement>;
}) {
  const lp = levelProgress(s.lifetimeWood);
  const trend = marketFactor(now) - marketFactor(now - 5000);
  const comboPct = Math.min(1, s.combo / CHOP.comboMax);
  const frenzyLeft = Math.ceil((s.frenzyUntil - now) / 1000);
  const stormLeft = Math.ceil((s.stormUntil - now) / 1000);

  return (
    <section className="hud">
      <div className="hud-card big" ref={woodRef}>
        <Icon name="currency/log" size={30} />
        <div>
          <div className="hud-num" data-testid="wood">{fmt(s.wood)}</div>
          <div className="hud-sub">wood · {fmt(d.woodPerSec)}/s</div>
        </div>
      </div>
      <div className="hud-card big" ref={coinRef}>
        <Icon name="currency/coin" size={30} />
        <div>
          <div className="hud-num gold" data-testid="coins">{fmt(s.coins)}</div>
          <div className="hud-sub">coins</div>
        </div>
      </div>

      <div className="hud-card level">
        <div className="level-row">
          <span className="level-badge">LV {lp.level}</span>
          <span className="hud-sub">{fmtInt(lp.into)} / {fmtInt(lp.need)} xp</span>
        </div>
        <div className="bar">
          <div className="bar-fill xp" style={{ width: `${lp.pct * 100}%` }} />
        </div>
      </div>

      <div className="hud-card stats">
        <Row k="Per chop" v={fmt(d.chopPower * d.frenzy * d.comboMult)} />
        <Row k="Crit chance" v={`${Math.round(d.critChance * 100)}%`} />
        <Row k="Multiplier" v={`x${d.totalMult.toFixed(2)}`} hot={d.totalMult > 1.5} />
        <Row k="Auto chops" v={`${fmt(d.autoChopsPerSec)}/s`} />
        <Row k="Trees felled" v={fmtInt(s.stats.treesFelled)} />
        <Row k="Best combo" v={fmtInt(s.stats.bestCombo)} />
      </div>

      <div className="hud-card market">
        <div className="level-row">
          <span className="hud-sub">Wood price</span>
          <span className={trend >= 0 ? "up" : "down"}>
            {trend >= 0 ? "▲" : "▼"} {d.price.toFixed(2)}
          </span>
        </div>
        <Sparkline now={now} />
      </div>

      <div className={`hud-card combo ${s.combo >= 25 ? "hot" : ""}`}>
        <div className="level-row">
          <span className="hud-sub">Combo</span>
          <span className="combo-num">x{s.combo}</span>
        </div>
        <div className="bar">
          <div className="bar-fill fire" style={{ width: `${comboPct * 100}%` }} />
        </div>
      </div>

      {frenzyLeft > 0 && (
        <div className="buff frenzy">
          FRENZY x{GOLDEN.frenzyMult} · {frenzyLeft}s
        </div>
      )}
      {stormLeft > 0 && <div className="buff storm">CHOP STORM · {stormLeft}s</div>}
    </section>
  );
}

function Row({ k, v, hot }: { k: string; v: string; hot?: boolean }) {
  return (
    <div className="stat-row">
      <span>{k}</span>
      <b className={hot ? "hot" : ""}>{v}</b>
    </div>
  );
}
