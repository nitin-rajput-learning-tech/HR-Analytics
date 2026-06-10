import { describe, it, expect } from "vitest";
import { demoWorkspaceBytes } from "./demo";
import { loadWorkspace } from "../workspace/workspace";
import { buildHealthHistory } from "../core/brain/brain";
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
});
