import { describe, it, expect } from "vitest";
import { quantile, median, mean } from "./stats";

describe("stats", () => {
  it("median of odd and even sets", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("quantiles via linear interpolation", () => {
    expect(quantile([1, 2, 3, 4, 5], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4, 5], 1)).toBe(5);
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(quantile([1, 2, 3, 4, 5], 0.75)).toBe(4);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it("handles empty and single-element inputs", () => {
    expect(quantile([], 0.5)).toBe(null);
    expect(quantile([7], 0.9)).toBe(7);
    expect(mean([])).toBe(null);
    expect(mean([2, 4])).toBe(3);
  });

  it("does not mutate the input array", () => {
    const a = [3, 1, 2];
    median(a);
    expect(a).toEqual([3, 1, 2]);
  });
});
