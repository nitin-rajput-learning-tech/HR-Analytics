import { describe, it, expect } from "vitest";
import { MemoryStore } from "../store/memoryStore";
import { DOMAIN_ORDER, DOMAIN_LABELS, buildDomain, buildAll, availableDomains } from "./index";
import type { Row } from "../ingest/types";

function snap(kind: string, asOf: string, rows: Row[]) {
  return { id: `${kind}:${asOf}`, kind, asOf, periodLabel: asOf, sourceFile: "x", compatibility: "full", rows };
}

describe("domain registry", () => {
  it("derives DOMAIN_ORDER and labels from one source of truth", () => {
    expect(DOMAIN_ORDER).toEqual(["talent_acquisition", "performance", "learning", "payroll", "operations", "engagement"]);
    expect(Object.keys(DOMAIN_LABELS).sort()).toEqual([...DOMAIN_ORDER].sort());
    expect(DOMAIN_LABELS.talent_acquisition).toBe("Talent Acquisition");
  });

  it("reports available domains from loaded dataset kinds", () => {
    const store = new MemoryStore();
    expect(availableDomains(store)).toEqual([]);
    store.add(snap("ta_requisition", "2026-05-01", [{ requisition_id: "R1", status: "Open", open_date: "2026-04-01" }]));
    store.add(snap("payroll_record", "2026-05-01", [{ employee_number: "E1", gross_monthly: 90000 }]));
    expect(availableDomains(store)).toEqual(["talent_acquisition", "payroll"]);
  });

  it("buildAll returns one result per domain, in order", () => {
    const store = new MemoryStore();
    const all = buildAll(store);
    expect(all).toHaveLength(DOMAIN_ORDER.length);
    // empty store → every domain degrades to a no-data result
    expect(all.every((d) => d.hasData === false)).toBe(true);
  });

  it("buildDomain dispatches to the right compute via the registry", () => {
    const store = new MemoryStore();
    store.add(snap("ta_requisition", "2026-05-01", [{ requisition_id: "R1", department: "Tech", job_title: "SDE", status: "Open", open_date: "2026-04-01", applications: 50 }]));
    const d = buildDomain(store, "talent_acquisition");
    expect(d.hasData).toBe(true);
  });
});
