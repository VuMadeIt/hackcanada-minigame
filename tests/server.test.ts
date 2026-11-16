import { describe, expect, it } from "vitest";
import { buyBuilding, chop, sell, tick } from "@/game/engine";
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

  it("rejects zones you haven't unlocked", () => {
    const { s, t } = play(5);
    s.zone = "night";
    expect(checkSave(stored(newGame(0), 0), s, t)).toEqual({ ok: false, reason: "bad_zone" });
  });
});
