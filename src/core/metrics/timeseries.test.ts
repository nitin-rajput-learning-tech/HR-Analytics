import { describe, it, expect } from "vitest";
import { periodList, storeAsOf, buildSeries, compactSeries } from "./timeseries";
import { MemoryStore } from "../store/memoryStore";
import type { Snapshot } from "../store/types";
import type { Row } from "../ingest/types";

const snap = (kind: string, asOf: string, rows: Row[]): Snapshot => ({
  id: `${kind}:${asOf}`,
  kind,
  asOf,
  periodLabel: asOf,
  sourceFile: kind + ".xlsx",
  compatibility: "full",
  rows,
});

const emp = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ employee_number: "E" + i }));

function multiPeriod(): MemoryStore {
  const store = new MemoryStore();
  store.add(snap("employee_master", "2026-01-31", emp(10)));
  store.add(snap("employee_master", "2026-02-28", emp(12)));
  store.add(snap("employee_master", "2026-03-31", emp(15)));
  return store;
}

describe("timeseries", () => {
  it("lists distinct periods ascending", () => {
    expect(periodList(multiPeriod())).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("can restrict the period list to one kind", () => {
    const store = multiPeriod();
    store.add(snap("ta_requisition", "2026-04-30", [{ requisition_id: "R1" }]));
    expect(periodList(store, "employee_master")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(periodList(store)).toContain("2026-04-30");
  });

  it("reconstructs the store as of a date (latest snapshot <= date per kind)", () => {
    const asOfFeb = storeAsOf(multiPeriod(), "2026-02-28");
    expect(asOfFeb.getLatest("employee_master")?.asOf).toBe("2026-02-28");
    expect(asOfFeb.getLatest("employee_master")?.rows.length).toBe(12);
    // a future period is excluded
    expect(storeAsOf(multiPeriod(), "2026-01-31").getLatest("employee_master")?.rows.length).toBe(10);
  });

  it("carries an older snapshot forward when a kind has no update that period", () => {
    const store = multiPeriod();
    store.add(snap("ta_requisition", "2026-01-31", [{ requisition_id: "R1" }]));
    // TA only uploaded in Jan; as of March it should still be present (carried forward)
    const asOfMar = storeAsOf(store, "2026-03-31");
    expect(asOfMar.getLatest("ta_requisition")?.asOf).toBe("2026-01-31");
  });

  it("builds a numeric series by computing a value per period", () => {
    const series = buildSeries(multiPeriod(), (s) => s.getLatest("employee_master")?.rows.length ?? null);
    expect(series).toEqual([
      { period: "2026-01-31", value: 10 },
      { period: "2026-02-28", value: 12 },
      { period: "2026-03-31", value: 15 },
    ]);
  });

  it("returns null for periods where the metric is unavailable", () => {
    const store = multiPeriod();
    const series = buildSeries(store, (s) => {
      const ta = s.getLatest("ta_requisition");
      return ta ? ta.rows.length : null;
    });
    expect(series.every((p) => p.value === null)).toBe(true);
  });

  it("compactSeries keeps only valued points, and needs >=2 to plot", () => {
    expect(
      compactSeries([
        { period: "a", value: null },
        { period: "b", value: 5 },
        { period: "c", value: 7 },
      ]),
    ).toEqual([
      { period: "b", value: 5 },
      { period: "c", value: 7 },
    ]);
    // a single point can't form a line
    expect(compactSeries([{ period: "a", value: 5 }])).toEqual([]);
  });
});
