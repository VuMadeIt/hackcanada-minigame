import { describe, expect, it } from "vitest";
import { buyBuilding, chop, sell, tick, woodRateCeiling } from "@/game/engine";
import { newGame, type GameState } from "@/game/state";
import { cleanName, fromDevName, signToken, verifyToken } from "@/server/identity";
import { checkSave, type Stored } from "@/server/validate";

const never = () => 0.99;
const SECRET = "test-secret";

const stored = (state: GameState, savedAt: number): Stored => ({
  state: structuredClone(state),
  savedAt,
  casinoCoins: 0,
  casinoUpgradeValue: 0,
});

function play(seconds: number, clicksPerSec = 10) {
  const s = newGame(0);
  let t = 0;
  for (let i = 0; i < seconds * clicksPerSec; i++) {
    t += 1000 / clicksPerSec;
    chop(s, t, never);
    tick(s, 1 / clicksPerSec, t, never);
    if (s.wood > 50) sell(s, t);
    buyBuilding(s, "beaver");
  }
  return { s, t };
}

describe("tokens", () => {
  it("round-trips and rejects tampering or expiry", () => {
    const tok = signToken({ sub: "u1", name: "Ada", exp: 2_000_000_000 }, SECRET);
    expect(verifyToken(tok, SECRET)?.sub).toBe("u1");
    expect(verifyToken(tok, "other")).toBeNull();
    expect(verifyToken(tok.slice(0, -2) + "xx", SECRET)).toBeNull();
    const old = signToken({ sub: "u1", name: "Ada", exp: 10 }, SECRET);
    expect(verifyToken(old, SECRET)).toBeNull();
  });

  it("cleans names", () => {
    expect(cleanName("  <b>Ada</b>\n  Lovelace ")).toBe("bAda/b Lovelace");
    expect(cleanName("")).toBe("Anonymous beaver");
    expect(fromDevName("Ada L").id).toBe("dev:ada-l");
  });
});

describe("checkSave", () => {
  it("accepts honest play", () => {
    const { s, t } = play(120);
    const v = checkSave(stored(newGame(0), 0), structuredClone(s), t);
    expect(v.ok).toBe(true);
  });

  it("rejects wood that grew too fast", () => {
    const { s } = play(5);
    s.lifetimeWood *= 1000;
    s.wood = s.lifetimeWood - s.stats.woodSold;
    expect(checkSave(stored(newGame(0), 0), s, 5000)).toEqual({ ok: false, reason: "too_fast" });
  });

  it("rejects coins that never came from selling", () => {
    const { s, t } = play(30);
    s.coins += 1e6;
    s.lifetimeCoins += 1e6;
    expect(checkSave(stored(newGame(0), 0), s, t).ok).toBe(false);
  });

  it("rejects buildings nobody paid for", () => {
    const { s, t } = play(30);
    s.buildings.tower = 3;
    expect(checkSave(stored(newGame(0), 0), s, t)).toEqual({ ok: false, reason: "spent_mismatch" });
  });

  it("rejects a save that goes backwards", () => {
    const { s, t } = play(30);
    const older = newGame(0);
    expect(checkSave(stored(s, t), older, t + 1000)).toEqual({ ok: false, reason: "went_backwards" });
  });

  it("cuts a frenzy that never ends down to one golden leaf's worth", () => {
    const { s, t } = play(30);
    s.frenzyUntil = t + 3600_000;
    const r = checkSave(stored(newGame(0), 0), s, t);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.frenzyUntil).toBeLessThanOrEqual(t + 30_000);
  });

  it("doesn't allow frenzy-speed wood for a whole hour", () => {
    const { s, t } = play(60);
    const prev = stored(s, t);
    const later = structuredClone(s);
    const hourly = (woodRateCeiling(s) / 1) * 3600;
    later.lifetimeWood += hourly * 0.9;
    later.wood += hourly * 0.9;
    expect(checkSave(prev, later, t + 3600_000)).toEqual({ ok: false, reason: "too_fast" });
  });

  it("doesn't let you put back coins you bet at the casino", () => {
    const { s, t } = play(60);
    const prev = { ...stored(s, t), casinoCoins: -s.coins };
    const restored = structuredClone(s);
    restored.savedAt = t + 1000;
    expect(checkSave(prev, restored, t + 1000)).toEqual({ ok: false, reason: "spent_mismatch" });
  });

  it("rejects zones you haven't unlocked", () => {
    const { s, t } = play(5);
    s.zone = "night";
    expect(checkSave(stored(newGame(0), 0), s, t)).toEqual({ ok: false, reason: "bad_zone" });
  });
});
