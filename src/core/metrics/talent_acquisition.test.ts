import { describe, it, expect } from "vitest";
import { compute } from "./talent_acquisition";
import type { Row } from "../ingest/types";

const AS_OF = "2026-05-31";

describe("talent_acquisition.compute", () => {
  it("funnel, offer-rate, aging and watchouts", () => {
    const rows: Row[] = [
      // stale open req (opened ~120 days before as-of) + low overall accept
      { requisition_id: "R1", department: "Tech", job_title: "SDE", status: "Open",
        open_date: "2026-01-31", applications: 100, shortlisted: 20, interviewed: 10,
        offers_made: 4, offers_accepted: 1, joined: 0, primary_source: "Agency" },
      { requisition_id: "R2", department: "Sales", job_title: "AE", status: "Filled",
        open_date: "2026-05-01", applications: 40, shortlisted: 10, interviewed: 6,
        offers_made: 2, offers_accepted: 1, joined: 1, primary_source: "Referral" },
    ];
    const r = compute(rows, AS_OF);
    expect(r.hasData).toBe(true);
    const kpi = Object.fromEntries(r.kpis.map((k) => [k.label, k.value]));
    expect(kpi["Open Requisitions"]).toBe("1");
    // 2 of 6 offers accepted = 33.3% -> below 50% -> high severity
    expect(kpi["Offer-Accept Rate"]).toContain("33.3%");
    const sev = new Set(r.watchouts.map((w) => w.severity));
    expect(sev.has("high")).toBe(true);
    expect(r.charts.some((c) => c.kind === "funnel")).toBe(true);
  });

  it("empty input is graceful", () => {
    const r = compute([]);
    expect(r.hasData).toBe(false);
    expect(r.blurb).toContain("Awaiting");
  });
});
