import { describe, expect, it } from "vitest";
import { BUILDINGS, CHOP, TOOLS, UPGRADES } from "@/game/config";
import {
  applyOffline,
  buildingCost,
  buyBuilding,
  buyTool,
  buyUpgrade,
  catchGolden,
  chop,
  derive,
  levelFor,
  maxAffordable,
  sell,
  spentTotal,
  tick,
  woodRateCeiling,
  xpForLevel,
} from "@/game/engine";
import { fmt, fmtTime } from "@/game/format";
import { newGame, normalize } from "@/game/state";

const never = () => 0.99;
const always = () => 0;

describe("levels", () => {
  it("starts at level 1 and matches the thresholds", () => {
    expect(levelFor(0)).toBe(1);
    for (let l = 2; l < 60; l++) {
      expect(levelFor(xpForLevel(l))).toBe(l);
      expect(levelFor(xpForLevel(l) * (1 - 1e-9))).toBe(l - 1);
    }
  });
});

describe("chopping", () => {
  it("gives wood and builds a combo", () => {
    const s = newGame(0);
    const a = chop(s, 1000, never)!;
    expect(a.amount).toBe(1);
    const b = chop(s, 1200, never)!;
    expect(b.combo).toBe(2);
    expect(b.amount).toBeCloseTo(1.01);
    expect(s.lifetimeWood).toBeCloseTo(2.01);
  });

  it("resets the combo after a pause", () => {
    const s = newGame(0);
    chop(s, 1000, never);
    chop(s, 1500, never);
    expect(chop(s, 5000, never)!.combo).toBe(1);
  });

  it("crits multiply the hit", () => {
    const s = newGame(0);
    const r = chop(s, 1000, () => 0.01)!;
    expect(r.crit).toBe("crit");
    expect(r.amount).toBe(CHOP.critMult);
  });

  it("fells the tree, pays a bonus and shows a stump for a moment", () => {
    const s = newGame(0);
    let felled = null;
    for (let i = 0; i < 40 && !felled; i++) {
      const r = chop(s, 1000 + i * 100, never);
      if (r?.felled) felled = r;
    }
    expect(felled).not.toBeNull();
    expect(felled!.bonus).toBeGreaterThan(0);
    expect(s.stats.treesFelled).toBe(1);
    expect(chop(s, s.tree.regrowAt - 1, never)).toBeNull();
    expect(chop(s, s.tree.regrowAt, never)).not.toBeNull();
  });
});

describe("shop", () => {
  it("buys tools in order", () => {
    const s = newGame(0);
    s.coins = TOOLS[1].cost;
    expect(buyTool(s, 0)).toBe(true);
    expect(s.tool).toBe(1);
    expect(s.coins).toBe(0);
    expect(buyTool(s, 0)).toBe(false);
  });

  it("bulk building cost equals buying one at a time", () => {
    for (const b of BUILDINGS) {
      let sum = 0;
      for (let i = 0; i < 10; i++) sum += buildingCost(b.id, i, 1);
      expect(buildingCost(b.id, 0, 10)).toBeGreaterThanOrEqual(sum - 10);
      expect(buildingCost(b.id, 0, 10)).toBeLessThanOrEqual(sum + 10);
    }
  });

  it("max affordable never overspends", () => {
    for (const coins of [0, 14, 15, 100, 1e5, 1e9]) {
      const q = maxAffordable("beaver", 3, coins);
      if (q > 0) expect(buildingCost("beaver", 3, q)).toBeLessThanOrEqual(coins);
      expect(buildingCost("beaver", 3, q + 1)).toBeGreaterThan(coins);
    }
  });

  it("locks upgrades until the right level", () => {
    const s = newGame(0);
    s.coins = 1e12;
    expect(buyUpgrade(s, "gnome")).toBe(false);
    s.lifetimeWood = xpForLevel(UPGRADES.find((u) => u.id === "gnome")!.unlockLevel);
    expect(buyUpgrade(s, "gnome")).toBe(true);
  });

  it("tracks exactly what was spent", () => {
    const s = newGame(0);
    s.coins = 1e9;
    s.lifetimeWood = 1e9;
    buyTool(s, 0);
    buyTool(s, 0);
    buyUpgrade(s, "whetstone");
    buyUpgrade(s, "whetstone");
    buyBuilding(s, "beaver", 7);
    buyBuilding(s, "sawmill", 2);
    expect(spentTotal(s)).toBeCloseTo(1e9 - s.coins, 0);
  });
});

describe("market and passive income", () => {
  it("sells wood for coins", () => {
    const s = newGame(0);
    s.wood = 100;
    const r = sell(s, 0);
    expect(r.coins).toBeCloseTo(100 * derive(s, 0).price);
    expect(s.wood).toBe(0);
    expect(s.lifetimeCoins).toBe(r.coins);
  });

  it("buildings make wood every tick", () => {
    const s = newGame(0);
    s.buildings.beaver = 10;
    const r = tick(s, 1, 0, never);
    expect(r.passive).toBeCloseTo(4);
  });

  it("robo arm chops on its own", () => {
    const s = newGame(0);
    s.upgrades.robo_arm = 3;
    const r = tick(s, 1, 0, never);
    expect(r.autoChops.length).toBe(3);
  });

  it("pays half of passive income while away, capped at 8 hours", () => {
    const s = newGame(0);
    s.buildings.lumberjack = 4;
    const rate = derive(s, 0).passive;
    const r = applyOffline(s, 3600_000);
    expect(r.wood).toBeCloseTo(rate * 3600 * 0.5);
    const s2 = newGame(0);
    s2.buildings.lumberjack = 4;
    expect(applyOffline(s2, 100 * 3600_000).sec).toBe(8 * 3600);
  });
});

describe("golden beaver", () => {
  it("frenzy multiplies chops by 7", () => {
    const s = newGame(0);
    expect(catchGolden(s, 0, always).kind).toBe("frenzy");
    expect(chop(s, 1000, never)!.amount).toBe(7);
  });
});

describe("ceiling", () => {
  it("is well above what fast honest play produces", () => {
    const s = newGame(0);
    s.tool = 3;
    s.upgrades = { whetstone: 5, robo_arm: 3, splitter: 4 };
    s.buildings = { sawmill: 10 };
    const t0 = s.lifetimeWood;
    let now = 1000;
    for (let i = 0; i < 200; i++) {
      now += 50;
      chop(s, now, Math.random);
      tick(s, 0.05, now, Math.random);
    }
    const rate = (s.lifetimeWood - t0) / ((now - 1000) / 1000);
    expect(woodRateCeiling(s)).toBeGreaterThan(rate * 3);
  });
});

describe("saves", () => {
  it("normalize fills holes and drops garbage", () => {
    const s = normalize({ wood: "lots", coins: -5, stats: { chops: 3 } }, 0);
    expect(s.wood).toBe(0);
    expect(s.coins).toBe(0);
    expect(s.stats.chops).toBe(3);
    expect(s.stats.crits).toBe(0);
  });
});

describe("format", () => {
  it("abbreviates big numbers", () => {
    expect(fmt(0.4)).toBe("0.4");
    expect(fmt(12)).toBe("12");
    expect(fmt(999)).toBe("999");
    expect(fmt(1234)).toBe("1.23K");
    expect(fmt(45_600_000)).toBe("45.6M");
    expect(fmt(1e15)).toBe("1.00Qa");
    expect(fmtTime(3725)).toBe("1h 2m");
  });
});
