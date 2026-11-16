"use client";

import { useEffect, useRef, useState } from "react";
import { CASINO_UNLOCK_LEVEL } from "@/game/config";
import { casinoOpen, ODDS, PAIR_ODDS, PAYOUT, spinCost, SYMBOLS } from "@/game/casino";
import { levelFor } from "@/game/engine";
import { fmt } from "@/game/format";
import type { GameState } from "@/game/state";
import { fanfare, play } from "@/game/sound";
import * as Net from "./net";
import { spriteUrl } from "./sprites";
import { Icon, Panel, PxButton } from "./ui";

type Reels = [string, string, string];

const LINES: Record<string, (r: Net.SpinReply) => string> = {
  jackpot: (r) => (r.prize ? `777! You won: ${r.prize.name}` : `777! Prize shelf is empty, so have ${fmt(r.reward?.coins ?? 0)} coins`),
  coins: (r) => `Coin rain! +${fmt(r.reward?.coins ?? 0)} coins`,
  leaves: (r) => `Maple luck. +${fmt(r.reward?.coins ?? 0)} coins`,
  wood: (r) => `Log jam! +${fmt(r.reward?.wood ?? 0)} wood`,
  spins: () => `Beaver party: ${PAYOUT.freeSpins} free spins`,
  upgrade: (r) => (r.reward?.upgrade ? `Free upgrade: ${r.reward.upgrade.name}` : `Gems! +${fmt(r.reward?.coins ?? 0)} coins`),
  pair: () => "A pair. You get your coins back",
  miss: (r) => (r.reels?.[0] === "seven" && r.reels[1] === "seven" ? "Sooo close." : "Nothing this time"),
};

const ERRORS: Record<string, string> = {
  poor: "Not enough coins for a spin.",
  locked: `The casino opens at level ${CASINO_UNLOCK_LEVEL}.`,
  rejected: "Your save didn't check out, so it was rolled back to the last good one.",
  stale: "Your game was open somewhere else. Synced up, try again.",
  network: "Couldn't reach the server. Try again in a sec.",
  offline: "Open the game from the Hack Canada dashboard to use the casino.",
};

export function CasinoPanel({
  s,
  now,
  freeSpins,
  onClose,
  onSpent,
  onSettled,
}: {
  s: GameState;
  now: number;
  freeSpins: number;
  onClose: () => void;
  onSpent: (bet: number, free: boolean) => void;
  onSettled: (r: Net.SpinReply & { newState?: GameState }) => void;
}) {
  const [reels, setReels] = useState<Reels>(["seven", "coin", "log"]);
  const [stopped, setStopped] = useState<[boolean, boolean, boolean]>([true, true, true]);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<{ text: string; tone: "win" | "lose" | "big" | "err" } | null>(null);
  const [won, setWon] = useState<{ name: string; code: string; redeemed: boolean }[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const spinTick = useRef<ReturnType<typeof setInterval> | null>(null);
  // a reply we got but haven't handed to the game yet, so closing early doesn't lose it
  const unsettled = useRef<(Net.SpinReply & { newState?: GameState }) | null>(null);
  const settle = useRef(onSettled);
  settle.current = onSettled;
  const mounted = useRef(true);
  const signedIn = Net.signedIn();
  const open = casinoOpen(s);
  const cost = spinCost(s, now);
  const canPay = freeSpins > 0 || s.coins >= cost;

  useEffect(() => {
    void Net.casinoInfo().then((i) => i && setWon(i.prizes));
    const t = timers.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      t.forEach(clearTimeout);
      if (spinTick.current) clearInterval(spinTick.current);
      if (unsettled.current) settle.current(unsettled.current);
      unsettled.current = null;
    };
  }, []);

  async function pull() {
    if (busy || !open || !signedIn) return;
    if (!canPay) {
      play("deny");
      setLine({ text: ERRORS.poor, tone: "err" });
      return;
    }
    setBusy(true);
    setLine(null);
    setStopped([false, false, false]);
    play("whoosh");
    spinTick.current = setInterval(() => {
      setReels(() => [0, 1, 2].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]) as Reels);
      play("reel", 1, 60);
    }, 80);
    const started = Date.now();
    const r = await Net.spin(s);
    if (r.ok) onSpent(r.bet ?? 0, !!r.free);
    if (!mounted.current) {
      onSettled(r);
      return;
    }
    unsettled.current = r;
    const final = (r.reels ?? reels) as Reels;
    // the third reel hangs a little longer when the first two already match
    const tease = final[0] === final[1] ? 900 : 0;
    const wait = Math.max(0, 700 - (Date.now() - started));
    const stopAt = [wait, wait + 350, wait + 700 + tease];
    stopAt.forEach((ms, i) =>
      timers.current.push(
        setTimeout(() => {
          setStopped((st) => {
            const n = [...st] as [boolean, boolean, boolean];
            n[i] = true;
            return n;
          });
          setReels((cur) => {
            const n = [...cur] as Reels;
            for (let k = 0; k <= i; k++) n[k] = final[k];
            return n;
          });
          play("click", 0.8 + i * 0.15);
          if (i === 2) {
            if (spinTick.current) clearInterval(spinTick.current);
            spinTick.current = null;
            unsettled.current = null;
            setBusy(false);
            if (!r.ok) {
              setLine({ text: ERRORS[r.error ?? "network"] ?? ERRORS.network, tone: "err" });
            } else {
              const big = r.outcome === "jackpot" || r.outcome === "upgrade" || r.outcome === "coins";
              const lose = r.outcome === "miss";
              setLine({ text: LINES[r.outcome ?? "miss"](r), tone: lose ? "lose" : big ? "big" : "win" });
              if (lose) play("lose");
              else if (big) fanfare();
              else play("win");
              if (r.prize) setWon((w) => [{ ...r.prize!, redeemed: false }, ...w]);
            }
            onSettled(r);
          }
        }, ms),
      ),
    );
  }

  const lvl = levelFor(s.lifetimeWood);

  return (
    <Panel title="Casino" onClose={onClose} className="casino">
      {!open ? (
        <div className="casino-locked">
          <img src={spriteUrl("casino/slot")} alt="" className="slot-img dim" />
          <p>
            The slot machine opens at <b>level {CASINO_UNLOCK_LEVEL}</b>. You&apos;re level {lvl}. Keep chopping.
          </p>
        </div>
      ) : (
        <>
          <div className={`slot ${busy ? "busy" : ""} ${line?.tone === "big" ? "flash" : ""}`}>
            <img src={spriteUrl("casino/slot")} alt="wooden slot machine" className="slot-img" />
            {reels.map((sym, i) => (
              <div key={i} className={`reel r${i} ${stopped[i] ? "" : "spinning"}`}>
                <img src={spriteUrl(`slots/${sym}`)} alt={sym} />
              </div>
            ))}
            <button className="lever" onClick={pull} disabled={busy} aria-label="Pull the lever" />
          </div>
          <div className={`slot-line ${line?.tone ?? ""}`} data-testid="slot-line">
            {line?.text ?? (busy ? "..." : "Three 7s wins a real prize.")}
          </div>
          <PxButton tone="red" className="spin-btn" onClick={pull} disabled={busy || !signedIn} data-testid="spin">
            {freeSpins > 0 ? (
              <>FREE SPIN ({freeSpins})</>
            ) : (
              <>
                SPIN <Icon name="currency/coin" size={16} /> {fmt(cost)}
              </>
            )}
          </PxButton>
          {!signedIn && <p className="casino-note">{ERRORS.offline}</p>}
          <table className="paytable">
            <tbody>
              {ODDS.map((o) => (
                <tr key={o.outcome}>
                  <td>
                    {[0, 1, 2].map((k) => (
                      <img key={k} src={spriteUrl(`slots/${o.sym}`)} alt="" />
                    ))}
                  </td>
                  <td>{PAYS[o.outcome]}</td>
                  <td className="odds">{Math.round(o.p * 1000) / 10}%</td>
                </tr>
              ))}
              <tr>
                <td className="any">any pair</td>
                <td>coins back</td>
                <td className="odds">{Math.round(PAIR_ODDS * 100)}%</td>
              </tr>
            </tbody>
          </table>
          {won.length > 0 && (
            <div className="won">
              <b>Your prizes</b>
              {won.map((p) => (
                <div key={p.code} className="won-row">
                  <span>{p.name}</span>
                  <code>{p.code}</code>
                  <small>{p.redeemed ? "picked up" : "show this at the prize desk"}</small>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

const PAYS: Record<string, string> = {
  jackpot: "mystery prize",
  upgrade: "free upgrade",
  spins: `${PAYOUT.freeSpins} free spins`,
  leaves: `${PAYOUT.leaves}x coins`,
  coins: `${PAYOUT.coins}x coins`,
  wood: `${PAYOUT.wood}x as wood`,
};
