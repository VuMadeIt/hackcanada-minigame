import { describe, expect, it } from "vitest";
import { PERSONAS, run } from "../scripts/simulate";

// loose bounds on purpose: these catch a tuning change that breaks the pacing, not small drift
describe("pacing", () => {
  const promptGap = run(PERSONAS[0], 24, 1, true);
  const afk = run(PERSONAS[2], 24, 1, true);
  const min = 60;

  it("buys something in the first half minute", () => {
    expect([...promptGap.firsts.values()][0]).toBeLessThan(30);
  });

  it("opens the casino within an hour of on-and-off play", () => {
    expect(promptGap.casinoAt).toBeGreaterThan(10 * min);
    expect(promptGap.casinoAt).toBeLessThan(60 * min);
  });

  it("still gets people who barely play to the casino on day one", () => {
    expect(afk.casinoAt).not.toBeNull();
    expect(afk.casinoAt!).toBeLessThan(6 * 3600);
  });

  it("keeps the chainsaw as a late goal", () => {
    expect(promptGap.firsts.get("Chainsaw") ?? Infinity).toBeGreaterThan(8 * 3600);
  });

  it("lets passive income alone pay for about 4 spins an hour once the casino is open", () => {
    expect(promptGap.passiveSpins.length).toBeGreaterThan(3);
    for (const [, n] of promptGap.passiveSpins) {
      expect(n).toBeGreaterThan(3);
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  it("always has something to buy within a couple of minutes of play", () => {
    expect(promptGap.worstGap).toBeLessThanOrEqual(150);
  });
});
