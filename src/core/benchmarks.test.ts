import { describe, it, expect } from "vitest";
import { benchmarkPosition, formatBand } from "./benchmarks";

describe("benchmarkPosition", () => {
  it("higher-is-better: above band better, within typical, below worse", () => {
    expect(benchmarkPosition(95, { low: 80, high: 90 }, true)).toBe("better");
    expect(benchmarkPosition(85, { low: 80, high: 90 }, true)).toBe("typical");
    expect(benchmarkPosition(70, { low: 80, high: 90 }, true)).toBe("worse");
  });

  it("lower-is-better: below band better, above worse", () => {
    expect(benchmarkPosition(3, { low: 0, high: 8 }, false)).toBe("typical");
    expect(benchmarkPosition(12, { low: 0, high: 8 }, false)).toBe("worse");
    expect(benchmarkPosition(8, { low: 10, high: 20 }, false)).toBe("better"); // first-year exit below typical
    expect(benchmarkPosition(25, { low: 10, high: 20 }, false)).toBe("worse");
  });

  it("returns none for a null value or missing band", () => {
    expect(benchmarkPosition(null, { low: 0, high: 8 }, true)).toBe("none");
    expect(benchmarkPosition(5, undefined, true)).toBe("none");
  });

  it("formats the band with its unit", () => {
    expect(formatBand({ low: 10, high: 20 }, "%")).toBe("10–20%");
    expect(formatBand({ low: 2.5, high: 5 }, "yrs")).toBe("2.5–5 yrs");
    expect(formatBand(undefined, "%")).toBe("—");
  });
});
