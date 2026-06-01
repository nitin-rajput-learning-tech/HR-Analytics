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
  it("maps leaver events for cross-functional", () => {
    const le = leaverEvents([m1, m2]);
    expect(le).toHaveLength(2);
    expect(le[0].department).toBe("Tech");
  });
  it("builds a populated domain with 2 snapshots and an empty state with 1", () => {
    expect(buildMovement([m1, m2], { activeHeadcount: 10 }).hasData).toBe(true);
    expect(buildMovement([m1], {}).hasData).toBe(false);
  });
  it("forecasts the requested horizon with a confidence band", () => {
    const f = forecastWorkforce(100, monthlyMovement(deriveEmployeeEvents([m1, m2])), 6);
    expect(f.months).toHaveLength(6);
    expect(f.lower).toBeLessThanOrEqual(f.projectedActive);
    expect(f.upper).toBeGreaterThanOrEqual(f.projectedActive);
    expect(f.months[5].lower).toBeLessThanOrEqual(f.months[5].upper);
  });
});
