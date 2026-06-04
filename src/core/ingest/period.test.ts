import { describe, it, expect } from "vitest";
import { parsePeriod, resolveMonthDayYear } from "./period";

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

  it("parses a natural-language date WITH a year", () => {
    expect(parsePeriod("Employee report as on 5th May 2026.xlsx", "as_of").asOf).toBe("2026-05-05");
    expect(parsePeriod("Report - May 5, 2026.xlsx", "as_of").asOf).toBe("2026-05-05");
    expect(parsePeriod("roster 05-Apr-2025.xlsx", "as_of").asOf).toBe("2025-04-05");
  });

  it("surfaces month/day (no asOf) for a year-less natural date", () => {
    const r = parsePeriod("15. Employee report for L&D team-airpay- as on 5th May (1).xlsx", "as_of");
    expect(r.asOf).toBeNull();
    expect(r.monthDay).toEqual({ month: 5, day: 5 });
  });

  it("does not mistake a bare 'Month YYYY' for a day", () => {
    // "May 2026" has no day → the day group must not swallow the year.
    expect(parsePeriod("Headcount May 2026.xlsx", "as_of").monthDay).toBeUndefined();
  });
});

describe("resolveMonthDayYear", () => {
  it("picks the most recent occurrence on or before today", () => {
    expect(resolveMonthDayYear(5, 5, "2026-06-04")).toBe("2026-05-05"); // 5 May already passed this year
    expect(resolveMonthDayYear(12, 5, "2026-06-04")).toBe("2025-12-05"); // 5 Dec is in the future → last year
    expect(resolveMonthDayYear(6, 4, "2026-06-04")).toBe("2026-06-04"); // today counts
  });
  it("returns null for an unparseable today", () => {
    expect(resolveMonthDayYear(5, 5, "not-a-date")).toBeNull();
  });
});
