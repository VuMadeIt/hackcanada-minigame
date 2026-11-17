import { useState } from "react";
import { BONE_MEAL_PER_LEVEL, BUILDINGS, TOOLS, UPGRADES, ZONES, type BuildingId, type UpgradeId, type ZoneId } from "@/game/config";
import { buildingCost, canBuyUpgrade, derive, levelFor, maxAffordable, upgradeCost } from "@/game/engine";
import { fmt } from "@/game/format";
import type { GameState } from "@/game/state";
import { Icon, Panel, PxButton } from "./ui";

type Tab = "tools" | "crew" | "upgrades" | "zones";
type Qty = 1 | 10 | "max";

export interface ShopActions {
  buyTool: () => void;
  buyUpgrade: (id: UpgradeId) => void;
  buyBuilding: (id: BuildingId, qty: number) => void;
  setZone: (id: ZoneId) => void;
}

export function shopBadge(s: GameState): number {
  let n = 0;
  const next = TOOLS[s.tool + 1];
  if (next && s.coins >= next.cost) n++;
  for (const u of UPGRADES) if (canBuyUpgrade(s, u.id) === "ok") n++;
  for (const b of BUILDINGS) if (s.coins >= buildingCost(b.id, s.buildings[b.id] ?? 0)) n++;
  return n;
}

export function ShopPanel({ s, now, onClose, act }: { s: GameState; now: number; onClose: () => void; act: ShopActions }) {
  const [tab, setTab] = useState<Tab>("tools");
  const [qty, setQty] = useState<Qty>(1);
  const level = levelFor(s.lifetimeWood);
  const d = derive(s, now);

  return (
    <Panel title="General Store" onClose={onClose} className="shop">
      <nav className="tabs">
        {(["tools", "crew", "upgrades", "zones"] as Tab[]).map((t) => (
          <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
            {t === "tools" ? "Axes" : t === "crew" ? "Crew" : t === "upgrades" ? "Upgrades" : "Places"}
          </button>
        ))}
      </nav>

      {tab === "tools" && (
        <ul className="rows">
          {TOOLS.map((t, i) => {
            const have = i <= s.tool;
            const next = i === s.tool + 1;
            const icon = i === 0 ? "tools/rusty" : `tools/${t.id}`;
            return (
              <li key={t.id} className={`row ${have ? "owned" : ""} ${next && s.coins >= t.cost ? "ready" : ""} ${!have && !next ? "dim" : ""}`}>
                <Icon name={icon} size={40} />
                <div className="row-text">
                  <b>{t.name}</b>
                  <small>{t.blurb}</small>
                  <span className="row-stat">{fmt(t.power)} power</span>
                </div>
                {have ? (
                  <span className="tag">{i === s.tool ? "In paw" : "Owned"}</span>
                ) : next ? (
                  <PxButton tone={s.coins >= t.cost ? "green" : "wood"} disabled={s.coins < t.cost} onClick={act.buyTool}>
                    <Icon name="currency/coin" size={14} /> {fmt(t.cost)}
                  </PxButton>
                ) : (
                  <span className="tag">???</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {tab === "crew" && (
        <>
          <div className="qty">
            Buy
            {([1, 10, "max"] as Qty[]).map((q) => (
              <button key={q} className={`chip ${qty === q ? "on" : ""}`} onClick={() => setQty(q)}>
                {q === "max" ? "Max" : `x${q}`}
              </button>
            ))}
          </div>
          <ul className="rows">
            {BUILDINGS.map((b, i) => {
              const have = s.buildings[b.id] ?? 0;
              const prevOwned = i === 0 || (s.buildings[BUILDINGS[i - 1].id] ?? 0) > 0 || have > 0;
              const n = qty === "max" ? Math.max(1, maxAffordable(b.id, have, s.coins)) : qty;
              const cost = buildingCost(b.id, have, n);
              const ok = s.coins >= cost;
              if (!prevOwned)
                return (
                  <li key={b.id} className="row dim">
                    <Icon name={b.icon} size={40} className="silhouette" />
                    <div className="row-text">
                      <b>???</b>
                      <small>Buy a {BUILDINGS[i - 1].name} first.</small>
                    </div>
                  </li>
                );
              const each = b.rate * d.levelMult * d.zoneMult * (1 + BONE_MEAL_PER_LEVEL * (s.upgrades.bone_meal ?? 0));
              return (
                <li key={b.id} className={`row ${ok ? "ready" : ""}`}>
                  <Icon name={b.icon} size={40} />
                  <div className="row-text">
                    <b>
                      {b.name} <span className="count">{have}</span>
                    </b>
                    <small>{b.blurb}</small>
                    <span className="row-stat">+{fmt(each)} wood/s each</span>
                  </div>
                  <PxButton tone={ok ? "green" : "wood"} disabled={!ok} onClick={() => act.buyBuilding(b.id, n)}>
                    {n > 1 && <span className="mult">x{n}</span>}
                    <Icon name="currency/coin" size={14} /> {fmt(cost)}
                  </PxButton>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {tab === "upgrades" && (
        <ul className="rows">
          {UPGRADES.map((u) => {
            const lvl = s.upgrades[u.id] ?? 0;
            const state = canBuyUpgrade(s, u.id);
            if (state === "locked")
              return (
                <li key={u.id} className="row dim">
                  <Icon name={u.icon} size={40} className="silhouette" />
                  <div className="row-text">
                    <b>???</b>
                    <small>Opens at level {u.unlockLevel}.</small>
                  </div>
                </li>
              );
            return (
              <li key={u.id} className={`row ${state === "ok" ? "ready" : ""}`}>
                <Icon name={u.icon} size={40} />
                <div className="row-text">
                  <b>
                    {u.name} <span className="count">{lvl}/{u.max}</span>
                  </b>
                  <small>{u.blurb}</small>
                </div>
                {state === "maxed" ? (
                  <span className="tag">Maxed</span>
                ) : (
                  <PxButton tone={state === "ok" ? "green" : "wood"} disabled={state !== "ok"} onClick={() => act.buyUpgrade(u.id)}>
                    <Icon name="currency/coin" size={14} /> {fmt(upgradeCost(u.id, lvl))}
                  </PxButton>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {tab === "zones" && (
        <ul className="rows">
          {ZONES.map((z) => {
            const open = level >= z.unlockLevel;
            const here = s.zone === z.id;
            return (
              <li key={z.id} className={`row zone ${open ? "" : "dim"} ${here ? "owned" : ""}`}>
                <div className={`zone-thumb ${z.id}`} />
                <div className="row-text">
                  <b>{z.name}</b>
                  <small>{open ? `x${z.mult} wood on everything` : `Opens at level ${z.unlockLevel}`}</small>
                </div>
                {here ? (
                  <span className="tag">You&apos;re here</span>
                ) : (
                  <PxButton tone="blue" disabled={!open} onClick={() => act.setZone(z.id)}>
                    Go
                  </PxButton>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
