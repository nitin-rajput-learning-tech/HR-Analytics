import { describe, it, expect } from "vitest";
import { buildLineage } from "./lineage";
import type { Snapshot } from "./store/types";
import type { Row } from "./ingest/types";

const snap = (kind: string, asOf: string, rows: number, sourceFile: string, compatibility = "full", periodLabel: string | null = null): Snapshot => ({
  id: `${kind}:${asOf}`,
  kind,
  asOf,
  periodLabel,
  sourceFile,
  compatibility,
  rows: Array.from({ length: rows }, (_, i) => ({ employee_number: "E" + i }) as Row),
});

describe("buildLineage", () => {
  const snaps = [
    snap("ta_requisition", "2026-05-31", 12, "TA_2026-05.xlsx", "full", "May 2026"),
    snap("employee_master", "2026-05-31", 150, "Employees_May.xlsx"),
    snap("employee_master", "2026-04-30", 148, "Employees_Apr.xlsx"),
    snap("payroll_record", "2026-05-31", 135, "Pay_May.csv", "partial"),
  ];
  const lin = buildLineage(snaps, (k) => ({ employee_master: "People & Org", ta_requisition: "Talent Acquisition", payroll_record: "Payroll" })[k] ?? k);

  it("lists every snapshot, sorted by domain label then period", () => {
    expect(lin.rows.map((r) => `${r.label}@${r.asOf}`)).toEqual([
      "Payroll@2026-05-31",
      "People & Org@2026-04-30",
      "People & Org@2026-05-31",
      "Talent Acquisition@2026-05-31",
    ]);
  });

  it("carries provenance per snapshot (source file, rows, compatibility, period)", () => {
    const apr = lin.rows.find((r) => r.label === "People & Org" && r.asOf === "2026-04-30")!;
    expect(apr.sourceFile).toBe("Employees_Apr.xlsx");
    expect(apr.rows).toBe(148);
    expect(apr.periodLabel).toBe("2026-04-30"); // falls back to asOf when no label
    const ta = lin.rows.find((r) => r.kind === "ta_requisition")!;
    expect(ta.periodLabel).toBe("May 2026");
  });

  it("summarises snapshots, kinds, rows, period range and compatibility split", () => {
    expect(lin.summary.snapshots).toBe(4);
    expect(lin.summary.kinds).toBe(3); // employee_master counted once
    expect(lin.summary.totalRows).toBe(12 + 150 + 148 + 135);
    expect(lin.summary.periodFrom).toBe("2026-04-30");
    expect(lin.summary.periodTo).toBe("2026-05-31");
    expect(lin.summary.full).toBe(3);
    expect(lin.summary.partial).toBe(1);
  });

  it("falls back to the kind as label and handles an empty store", () => {
    expect(buildLineage([snap("x_kind", "2026-01-01", 1, "f.xlsx")]).rows[0].label).toBe("x_kind");
    const empty = buildLineage([]);
    expect(empty.rows).toEqual([]);
    expect(empty.summary).toEqual({ snapshots: 0, kinds: 0, totalRows: 0, periodFrom: null, periodTo: null, full: 0, partial: 0 });
  });
});
