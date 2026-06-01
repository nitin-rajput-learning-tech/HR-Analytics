import { describe, it, expect } from "vitest";
import { buildFactsMarkdown } from "./factsPack";
import { buildNewsletter } from "./newsletter";
import { MemoryStore } from "../core/store/memoryStore";
import type { Snapshot } from "../core/store/types";
import type { Row } from "../core/ingest/types";

const snap = (kind: string, asOf: string, rows: Row[], periodLabel?: string): Snapshot => ({
  id: `${kind}:${asOf}`,
  kind,
  asOf,
  periodLabel: periodLabel ?? asOf,
  sourceFile: kind + ".xlsx",
  compatibility: "full",
  rows,
});

function store(): MemoryStore {
  const s = new MemoryStore();
  s.add(
    snap(
      "employee_master",
      "2026-05-31",
      Array.from({ length: 20 }, (_, i) => ({ employee_number: "E" + i, department: "Tech", employment_status: "Working" })),
      "May 2026",
    ),
  );
  s.add(
    snap(
      "pms_review",
      "2026-05-31",
      Array.from({ length: 10 }, (_, i) => ({ employee_number: "E" + i, manager_review_done: i < 5, final_rating: 3, rating_scale: "1-5" })),
    ),
  );
  s.add(snap("payroll_statutory", "2026-05-31", [
    { pay_month: "2026-05", statutory_type: "PF", status: "Paid" },
    { pay_month: "2026-05", statutory_type: "TDS", status: "Late" },
  ]));
  return s;
}

describe("buildFactsMarkdown", () => {
  it("renders title, brief, sections and a numbered action plan", () => {
    const md = buildFactsMarkdown(buildNewsletter(store(), { appName: "Acme HR", periodLabel: "May 2026", generatedAtLabel: "1 June 2026" }));
    expect(md.startsWith("# Acme HR — HR Newsletter")).toBe(true);
    expect(md).toContain("## Executive Brief");
    expect(md).toContain("## People & Org");
    expect(md).toContain("## Prioritised Action Plan");
    expect(/\n1\. \*\*\[/.test(md)).toBe(true);
    expect(/\[(HIGH|MEDIUM|LOW)\]/.test(md)).toBe(true);
  });

  it("produces valid markdown even from an empty store", () => {
    const md = buildFactsMarkdown(buildNewsletter(new MemoryStore(), { appName: "X" }));
    expect(md.startsWith("# X — HR Newsletter")).toBe(true);
    expect(md).toContain("## People & Org");
  });
});
