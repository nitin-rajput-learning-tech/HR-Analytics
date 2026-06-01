import { describe, it, expect } from "vitest";
import { compute } from "./admin";
import type { Row } from "../ingest/types";

const contractRows: Row[] = [
  { contract_id: "C1", vendor_name: "V1", category: "IT", expiry_date: "2026-06-10", annual_cost: 500000 },
  { contract_id: "C2", vendor_name: "V2", category: "Facilities", expiry_date: "2026-03-01", annual_cost: 300000 },
];
const assetRows: Row[] = [
  { asset_id: "A1", asset_type: "Laptop", status: "Allocated", value: 75000 },
  { asset_id: "A2", asset_type: "Phone", status: "Lost", value: 20000 },
];

describe("admin.compute", () => {
  it("returns an empty domain with no inputs", () => {
    expect(compute({}).hasData).toBe(false);
  });

  it("buckets contracts by time-to-expiry and flags renewals", () => {
    const d = compute({ contractRows, asOf: "2026-05-31" });
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    expect(kpi["Contracts ≤30d"]).toBe("1");
    const w = d.watchouts.find((x) => x.title === "Contract renewals due");
    expect(w).toBeTruthy();
    expect(w!.severity).toBe("high"); // one already expired
  });

  it("reports allocated assets and flags lost ones", () => {
    const d = compute({ assetRows, asOf: "2026-05-31" });
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    expect(kpi["Assets Allocated"]).toBe("1");
    expect(d.watchouts.some((w) => w.title === "Assets reported lost")).toBe(true);
  });

  it("flags an offboarding asset-recovery gap", () => {
    const lifecycleRows: Row[] = [
      { employee_number: "E1", type: "Offboarding", checklist_complete: true, asset_recovered: false },
      { employee_number: "E2", type: "Onboarding", checklist_complete: true },
    ];
    const d = compute({ lifecycleRows, asOf: "2026-05-31" });
    expect(d.watchouts.some((w) => w.title === "Offboarding asset-recovery gap")).toBe(true);
  });
});
