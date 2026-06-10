import { describe, it, expect } from "vitest";
import { buildEntityRollup } from "./entity_rollup";
import type { Row } from "../ingest/types";

const ASOF = "2026-05-31";
const e = (n: string, entity: string, dept: string, extra: Partial<Row> = {}): Row => ({
  employee_number: n,
  legal_entity: entity,
  department: dept,
  employment_status: "Working",
  date_joined: "2020-01-01",
  ...extra,
});

describe("buildEntityRollup", () => {
  it("degrades without a legal-entity column", () => {
    const d = buildEntityRollup({ employeeRows: [{ employee_number: "E1", employment_status: "Working" }], asOf: ASOF });
    expect(d.hasData).toBe(false);
  });

  it("rolls up headcount/tenure/departments per entity + a group total", () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => e("A" + i, "Acme Payments", i < 4 ? "Tech" : "Sales")),
      ...Array.from({ length: 3 }, (_, i) => e("B" + i, "Acme Academy", "L&D")),
      e("X", "Acme Payments", "Tech", { employment_status: "Relieved" }),
    ];
    const d = buildEntityRollup({ employeeRows: rows, asOf: ASOF });
    expect(d.hasData).toBe(true);
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    expect(kpi["Legal Entities"]).toBe("2");
    expect(kpi["Group Headcount"]).toBe("11"); // 8 + 3 active (relieved excluded)
    // largest entity = Acme Payments (8 of 11 ≈ 72.7%)
    const largest = d.kpis.find((k) => k.label === "Largest Entity")!;
    expect(largest.hint).toBe("Acme Payments");
    // table sorted largest-first, with department counts
    const top = d.tables[0].rows[0];
    expect(top[0]).toBe("Acme Payments");
    expect(top[1]).toBe(8); // active
    expect(top[2]).toBe(1); // relieved
    expect(top[4]).toBe(2); // departments (Tech, Sales)
    // headcount-by-entity chart drills to legal_entity
    expect(d.charts[0].drill).toBe("legal_entity");
    expect(d.tables[0].drill).toBe("legal_entity");
  });

  it("adds per-entity cost from the payroll aggregate", () => {
    const rows = [...Array.from({ length: 10 }, (_, i) => e("A" + i, "Acme Payments", "Tech")), ...Array.from({ length: 5 }, (_, i) => e("B" + i, "Acme Academy", "L&D"))];
    const payrollAggregateRows: Row[] = [
      { legal_entity: "Acme Payments", department: "Tech", total_gross: 1000000, headcount_paid: 10 }, // 100k/head
      { legal_entity: "Acme Academy", department: "L&D", total_gross: 400000, headcount_paid: 5 }, // 80k/head
    ];
    const d = buildEntityRollup({ employeeRows: rows, payrollAggregateRows, asOf: ASOF });
    expect(d.kpis.some((k) => k.label === "Group Monthly Cost")).toBe(true);
    expect(d.tables[0].columns).toContain("Monthly cost");
    expect(d.tables[0].columns).toContain("Cost / head");
  });

  it("flags headcount concentration when one entity dominates", () => {
    const rows = [...Array.from({ length: 18 }, (_, i) => e("A" + i, "Acme Payments", "Tech")), ...Array.from({ length: 2 }, (_, i) => e("B" + i, "Acme Academy", "L&D"))];
    const d = buildEntityRollup({ employeeRows: rows, asOf: ASOF }); // 18/20 = 90%
    expect(d.watchouts.some((w) => /concentrated in one entity/i.test(w.title))).toBe(true);
  });
});
