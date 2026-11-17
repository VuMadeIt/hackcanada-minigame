"use client";

import { useEffect, useRef, useState } from "react";
import { loadVolumes, play, setVolume, SOUND_GROUPS, unlockAudio, type Volumes } from "@/game/sound";

const ROWS: { id: keyof Volumes; label: string; sample: Parameters<typeof play>[0] }[] = [
  { id: "master", label: "Everything", sample: "click" },
  ...SOUND_GROUPS,
];

/** The speaker button (mute everything) plus a menu with a volume slider per kind of sound. */
export function SoundMenu({ muted, onToggleMute }: { muted: boolean; onToggleMute: () => void }) {
  const [open, setOpen] = useState(false);
  const [vol, setVol] = useState<Volumes | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setVol(loadVolumes()), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="sound-box">
      <button
        className={`sound-toggle ${muted ? "off" : ""}`}
        onClick={onToggleMute}
        aria-label={muted ? "Turn sound on" : "Turn sound off"}
        aria-pressed={!muted}
        title={muted ? "Sound off (M)" : "Sound on (M)"}
        data-testid="sound"
      >
        <SpeakerIcon off={muted} />
        <span>{muted ? "Sound off" : "Sound on"}</span>
      </button>
      <button
        className={`sound-toggle levels ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="Sound levels"
        aria-expanded={open}
        title="Sound levels"
        data-testid="sound-levels"
      >
        <SlidersIcon />
      </button>
      {open && vol && (
        <div className="sound-menu" role="group" aria-label="Sound levels" data-testid="sound-menu">
          <b>Sound levels</b>
          {ROWS.map((r) => (
            <label key={r.id} className="sound-row">
              <span>{r.label}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(vol[r.id] * 100)}
                onChange={(e) => {
                  setVol(setVolume(r.id, Number(e.target.value) / 100));
                  unlockAudio();
                  play(r.sample, 1, 120);
                }}
                data-testid={`volume-${r.id}`}
              />
              <small>{Math.round(vol[r.id] * 100)}%</small>
            </label>
          ))}
          {muted && <p className="sound-note">Sound is off. Press M or the speaker to hear these.</p>}
        </div>
      )}
    </div>
  );
}

function SpeakerIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" shapeRendering="crispEdges" aria-hidden>
      <path d="M1 6h3v4H1zM4 5h2v6H4zM6 3h2v10H6z" fill="currentColor" />
      {off ? (
        <path d="M10 5h1v1h-1zM11 6h1v1h-1zM12 7h1v1h-1zM13 8h1v1h-1zM14 9h1v1h-1zM14 5h1v1h-1zM13 6h1v1h-1zM11 8h1v1h-1zM10 9h1v1h-1z" fill="currentColor" />
      ) : (
        <path d="M10 6h1v4h-1zM12 4h1v1h-1zM13 5h1v6h-1zM12 11h1v1h-1z" fill="currentColor" />
      )}
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" shapeRendering="crispEdges" aria-hidden>
      <path d="M3 1h2v14H3zM7 1h2v14H7zM11 1h2v14h-2z" fill="currentColor" opacity="0.45" />
      <path d="M2 9h4v3H2zM6 3h4v3H6zM10 7h4v3h-4z" fill="currentColor" />
    </svg>
  );
}
