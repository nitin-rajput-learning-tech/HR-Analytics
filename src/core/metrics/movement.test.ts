import { describe, it, expect } from "vitest";
import { deriveEmployeeEvents, monthlyMovement, buildMovement, forecastWorkforce, leaverEvents } from "./movement";
import type { Snapshot } from "../store/types";
import type { Row } from "../ingest/types";

const snap = (asOf: string, rows: Row[]): Snapshot => ({
  id: "employee_master:" + asOf,
  kind: "employee_master",
  asOf,
  periodLabel: asOf,
  sourceFile: "e.xlsx",
  compatibility: "full",
  rows,
});
const emp = (n: string, status: string): Row => ({ employee_number: n, employment_status: status, department: "Tech", legal_entity: "Acme", last_working_day: "" });

const m1 = snap("2026-04-30", Array.from({ length: 10 }, (_, i) => emp("E" + (i + 1), "Working")));
const m2 = snap("2026-05-31", [
  ...Array.from({ length: 8 }, (_, i) => emp("E" + (i + 1), "Working")),
  emp("E11", "Working"),
  emp("E12", "Working"),
]);

describe("movement", () => {
  it("derives joiner/leaver events from consecutive snapshots", () => {
    const ev = deriveEmployeeEvents([m1, m2]);
    expect(ev.filter((e) => e.event_type === "joiner")).toHaveLength(2);
    expect(ev.filter((e) => e.event_type === "leaver")).toHaveLength(2);
  });
  it("is order-independent", () => {
    expect(deriveEmployeeEvents([m2, m1])).toHaveLength(4);
  });
  it("aggregates monthly movement", () => {
    const mv = monthlyMovement(deriveEmployeeEvents([m1, m2]));
    expect(mv).toHaveLength(1);
    expect(mv[0].joiners).toBe(2);
    expect(mv[0].leavers).toBe(2);
    expect(mv[0].net).toBe(0);
  });
  it("reports 0% attrition (not NaN) when the roster is unchanged between snapshots (FIX-3)", () => {
    const mayIdentical = snap("2026-05-31", Array.from({ length: 10 }, (_, i) => emp("E" + (i + 1), "Working")));
    expect(deriveEmployeeEvents([m1, mayIdentical])).toHaveLength(0); // zero movement → months === 0
    const dm = buildMovement([m1, mayIdentical]);
    expect(dm.hasData).toBe(true);
    const attr = dm.kpis.find((k) => k.label === "Annualised Attrition")!;
    expect(attr.value).not.toContain("NaN");
    expect(parseFloat(attr.value)).toBe(0);
  });
  it("maps leaver events for cross-functional", () => {
    const le = leaverEvents([m1, m2]);
    expect(le).toHaveLength(2);
    expect(le[0].department).toBe("Tech");
  });
  it("builds a populated domain with 2 snapshots and an empty state with 1", () => {
    expect(buildMovement([m1, m2], { activeHeadcount: 10 }).hasData).toBe(true);
    expect(buildMovement([m1], {}).hasData).toBe(false);
  });
  it("forecasts the requested horizon with an uncertainty band", () => {
    const f = forecastWorkforce(100, monthlyMovement(deriveEmployeeEvents([m1, m2])), 6);
    expect(f.months).toHaveLength(6);
    expect(f.lower).toBeLessThanOrEqual(f.projectedActive);
    expect(f.upper).toBeGreaterThanOrEqual(f.projectedActive);
    expect(f.months[5].lower).toBeLessThanOrEqual(f.months[5].upper);
  });

  it("collapses the band to zero width with too little history (σ=0)", () => {
    // 1 month of movement → no basis for volatility
    const f = forecastWorkforce(100, monthlyMovement(deriveEmployeeEvents([m1, m2])), 6);
    expect(f.sigma).toBe(0);
    expect(f.months[5].lower).toBe(f.months[5].upper);
  });

  it("derives the band from net-movement volatility and widens it with the horizon", () => {
    const mv = [
      { month: "2026-01", label: "Jan", joiners: 5, leavers: 1, net: 4 },
      { month: "2026-02", label: "Feb", joiners: 1, leavers: 5, net: -4 },
      { month: "2026-03", label: "Mar", joiners: 4, leavers: 2, net: 2 },
    ];
    const f = forecastWorkforce(100, mv, 6);
    expect(f.sigma).toBeGreaterThan(0);
    const w1 = f.months[0].upper - f.months[0].projectedActive;
    const w6 = f.months[5].upper - f.months[5].projectedActive;
    expect(w6).toBeGreaterThan(w1); // band fans out as √horizon
  });

  it("annualises attrition on AVERAGE headcount, not the ending count", () => {
    // 20 → 10 active over one month = 10 leavers; avg HC = 15, months = 1
    // expected = 10 / 15 * 12 / 1 = 8.0 = 800%  (ending-count would give 1200%)
    const big = snap("2026-04-30", Array.from({ length: 20 }, (_, i) => emp("E" + (i + 1), "Working")));
    const small = snap("2026-05-31", Array.from({ length: 10 }, (_, i) => emp("E" + (i + 1), "Working")));
    const dm = buildMovement([big, small], { activeHeadcount: 10 });
    const attr = dm.kpis.find((k) => k.label === "Annualised Attrition");
    expect(attr?.value).toBe("800.0%");
    expect(attr?.hint).toContain("avg HC 15");
  });
});
