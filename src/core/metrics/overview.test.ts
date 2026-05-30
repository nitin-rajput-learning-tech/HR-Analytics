import { describe, it, expect } from "vitest";
import { overviewKpis } from "./overview";

describe("overviewKpis", () => {
  it("counts active/relieved and ratios", () => {
    const rows = [
      { employment_status: "Working" },
      { employment_status: "Working" },
      { employment_status: "Relieved" },
    ];
    const k = overviewKpis(rows as any);
    expect(k.total).toBe(3);
    expect(k.active).toBe(2);
    expect(k.relieved).toBe(1);
    expect(k.activeRatio).toBeCloseTo(66.7, 1);
  });
});
