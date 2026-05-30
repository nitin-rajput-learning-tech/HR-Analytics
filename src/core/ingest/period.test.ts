import { describe, it, expect } from "vitest";
import { parsePeriod } from "./period";

describe("parsePeriod", () => {
  it("parses an ISO month to last-day + label (month kind)", () => {
    const r = parsePeriod("TA_requisitions_2026-05.xlsx", "month");
    expect(r.asOf).toBe("2026-05-31");
    expect(r.periodLabel).toBe("2026-05");
  });
  it("parses an ISO date directly", () => {
    expect(parsePeriod("Admin_assets_2026-05-10.xlsx", "as_of").asOf).toBe("2026-05-10");
  });
  it("parses an Indian-FY cycle (FY26-H1 -> 30 Sep 2025)", () => {
    const r = parsePeriod("PMS_cycle_FY26-H1.xlsx", "cycle");
    expect(r.asOf).toBe("2025-09-30");
    expect(r.periodLabel).toBe("FY26-H1");
  });
  it("returns null asOf when nothing parses", () => {
    expect(parsePeriod("whatever.xlsx", "month").asOf).toBeNull();
  });
});
