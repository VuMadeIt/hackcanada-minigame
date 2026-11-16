"use client";

import { useEffect, useState } from "react";
import { fmt } from "@/game/format";
import * as Net from "./net";
import { Icon, Panel } from "./ui";

const MEDALS = ["#e5a51f", "#b9c2c9", "#c27a3a"];

export function LeaderboardPanel({ myWood, onClose }: { myWood: number; onClose: () => void }) {
  const [board, setBoard] = useState<Net.Board | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      Net.leaderboard().then((b) => {
        if (!alive) return;
        if (b) setBoard(b);
        else setFailed(true);
      });
    void load();
    const t = setInterval(load, 15_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // the server only knows what you'd saved; show your live number on your own row
  const wood = (row: { wood: number; you?: boolean }) => (row.you ? Math.max(row.wood, myWood) : row.wood);
  const meOnBoard = board?.top.some((r) => r.you);

  return (
    <Panel title="Leaderboard" onClose={onClose} className="board">
      <p className="board-sub">Most wood chopped, all time</p>
      {!board ? (
        <p className="board-empty">{failed ? "Couldn't load the board. Try again in a bit." : "Counting logs..."}</p>
      ) : board.top.length === 0 ? (
        <p className="board-empty">No one&apos;s on the board yet. Go chop something.</p>
      ) : (
        <ol className="board-list">
          {board.top.map((r) => (
            <li key={r.rank} className={r.you ? "you" : ""}>
              <span className="rank" style={r.rank <= 3 ? { background: MEDALS[r.rank - 1] } : undefined}>
                {r.rank}
              </span>
              <span className="nm">{r.name}</span>
              <span className="lv">Lv {r.level}</span>
              <span className="wd">
                <Icon name="currency/log" size={14} /> {fmt(wood(r))}
              </span>
            </li>
          ))}
        </ol>
      )}
      {board?.me && !meOnBoard && (
        <div className="board-me">
          <span className="rank">{board.me.rank}</span>
          <span className="nm">{board.me.name} (you)</span>
          <span className="wd">
            <Icon name="currency/log" size={14} /> {fmt(Math.max(board.me.wood, myWood))}
          </span>
        </div>
      )}
      {board && !Net.signedIn() && <p className="board-empty">Open the game from the Hack Canada dashboard to get on the board.</p>}
      {board && board.players > 0 && <p className="board-foot">{fmt(board.players)} hackers chopping</p>}
    </Panel>
  );
}
