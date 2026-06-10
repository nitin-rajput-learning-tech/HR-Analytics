import { describe, it, expect } from "vitest";
import { demoWorkspaceBytes } from "./demo";
import { loadWorkspace } from "../workspace/workspace";
import { buildHealthHistory, buildBrain } from "../core/brain/brain";
import { periodList } from "../core/metrics/timeseries";

// DEMO-HIST: the shipped demo carries ~6 months of history so the longitudinal
// trends built in UP-1 (KPI sparklines + the HR Health line) are meaningful in the
// showroom, not 2-point segments. Verified deterministically against the embedded
// workspace (no browser, no live-data dependency).
describe("demo workspace history (DEMO-HIST)", () => {
  const { store } = loadWorkspace(demoWorkspaceBytes());

  it("ships >=6 months of employee + functional history", () => {
    expect(periodList(store, "employee_master").length).toBeGreaterThanOrEqual(6);
    expect(periodList(store, "ta_requisition").length).toBeGreaterThanOrEqual(6); // functional sparklines populate
  });

  it("produces a multi-point HR Health history line", () => {
    const hist = buildHealthHistory(store);
    expect(hist).not.toBeNull();
    expect(hist!.values.length).toBeGreaterThanOrEqual(6);
    expect(hist!.values.every((v) => v >= 0 && v <= 100)).toBe(true);
  });

  // FIX-7 (demo realism): the showroom must demonstrate the HR Brain's PROGRESS
  // narrative, not just open issues — a finding that was flagged last period and has
  // since cleared. The demo generator clears the latest month's statutory filings to
  // 100% on-time while earlier months keep a gap, so "Statutory remittances not fully
  // on time" resolves period-over-period. Guards that capability against demo-data
  // regressions (e.g. if the generator stops clearing the latest month).
  it("surfaces at least one resolved finding (period-over-period progress)", () => {
    const brain = buildBrain(store);
    expect(brain.resolved.length).toBeGreaterThanOrEqual(1);
    expect(brain.resolved.some((r) => r.id === "statutory")).toBe(true);
    // the resolved finding must NOT also be in the current open set
    const openIds = new Set(brain.findings.map((f) => f.id));
    expect(brain.resolved.every((r) => !openIds.has(r.id))).toBe(true);
    // and the cleared critical compliance gap lifts the headline into a positive trend
    expect(brain.health.delta ?? 0).toBeGreaterThan(0);
  });
});
