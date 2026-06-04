import { describe, it, expect } from "vitest";
import { bandHigher, bandLower } from "./maturity";

describe("maturity bands", () => {
  it("bandHigher maps against descending thresholds", () => {
    expect(bandHigher(95, [90, 85, 80, 70])).toBe(5);
    expect(bandHigher(86, [90, 85, 80, 70])).toBe(4);
    expect(bandHigher(82, [90, 85, 80, 70])).toBe(3);
    expect(bandHigher(60, [90, 85, 80, 70])).toBe(1);
  });
  it("bandLower (lower-is-better) maps against ascending thresholds", () => {
    expect(bandLower(1, [2, 5, 8, 15])).toBe(5);
    expect(bandLower(6, [2, 5, 8, 15])).toBe(3);
    expect(bandLower(20, [2, 5, 8, 15])).toBe(1);
  });
});
