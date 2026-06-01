import { describe, it, expect } from "vitest";
import {
  humanizeInt, humanizeMoneyInr, pct, formatPct, formatDelta, trendPhrase, thresholdFlag, joinClauses,
} from "./narrative";

describe("narrative", () => {
  it("humanizeMoneyInr uses lakh/crore", () => {
    expect(humanizeMoneyInr(1_80_00_000)).toBe("₹1.80 Cr");
    expect(humanizeMoneyInr(1_50_000)).toBe("₹1.50 L");
    expect(humanizeMoneyInr(5_000)).toBe("₹5.0K");
    expect(humanizeMoneyInr(-2_10_000)).toBe("-₹2.10 L");
    expect(humanizeMoneyInr(null)).toBe("n/a");
  });
  it("pct + formatPct", () => {
    expect(pct(1, 4)).toBe(25);
    expect(pct(1, 0)).toBeNull();
    expect(pct(null, 10)).toBeNull();
    expect(formatPct(25)).toBe("25.0%");
    expect(formatPct(null)).toBe("n/a");
  });
  it("formatDelta directions", () => {
    expect(formatDelta(110, 100)).toContain("+10");
    expect(formatDelta(110, 100)).toContain("+10.0%");
    expect(formatDelta(90, 100)).toContain("−10");
    expect(formatDelta(100, 100)).toBe("no change vs prior");
    expect(formatDelta(100, null)).toBeNull();
  });
  it("thresholdFlag levels", () => {
    expect(thresholdFlag(0.25, { watch: 0.1, alert: 0.2 }).level).toBe("alert");
    expect(thresholdFlag(0.12, { watch: 0.1, alert: 0.2 }).level).toBe("watch");
    expect(thresholdFlag(0.05, { watch: 0.1, alert: 0.2 }).level).toBe("good");
    expect(thresholdFlag(60, { watch: 80, alert: 70, higherIsWorse: false }).level).toBe("alert");
    expect(thresholdFlag(null, { watch: 1, alert: 2 }).level).toBe("neutral");
  });
  it("trendPhrase + joinClauses + humanizeInt", () => {
    expect(trendPhrase([1, 2, 3, 4])).toContain("rising");
    expect(trendPhrase([4, 3, 2, 1])).toContain("easing");
    expect(trendPhrase([5])).toBe("insufficient history to establish a trend");
    expect(joinClauses(["a"])).toBe("a");
    expect(joinClauses(["a", "b"])).toBe("a and b");
    expect(joinClauses(["a", "b", "c"])).toBe("a, b, and c");
    expect(joinClauses(["", "  ", "only"])).toBe("only");
    expect(humanizeInt(1234)).toBe("1,234");
  });
});
