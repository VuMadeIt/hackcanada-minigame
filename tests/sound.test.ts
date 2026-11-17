import { describe, expect, it } from "vitest";
import { gainFor, groupOf, parseVolumes } from "@/game/sound";

describe("sound levels", () => {
  it("defaults to full volume when nothing is saved or the save is junk", () => {
    expect(parseVolumes(null)).toEqual({ master: 1, tree: 1, coins: 1, casino: 1 });
    expect(parseVolumes("{oops")).toEqual({ master: 1, tree: 1, coins: 1, casino: 1 });
  });

  it("keeps saved levels and clamps bad ones", () => {
    const v = parseVolumes(JSON.stringify({ master: 0.5, tree: 2, coins: -1, casino: "loud" }));
    expect(v).toEqual({ master: 0.5, tree: 1, coins: 0, casino: 1 });
  });

  it("scales each group by the master level", () => {
    const v = parseVolumes(JSON.stringify({ master: 0.5, tree: 0.4, casino: 0 }));
    expect(gainFor("tree", v)).toBeCloseTo(0.2);
    expect(gainFor("coins", v)).toBeCloseTo(0.5);
    expect(gainFor("casino", v)).toBe(0);
  });

  it("puts chops, coins and reels in the right groups", () => {
    expect(groupOf("chop")).toBe("tree");
    expect(groupOf("fell")).toBe("tree");
    expect(groupOf("sell")).toBe("coins");
    expect(groupOf("reel")).toBe("casino");
  });
});
