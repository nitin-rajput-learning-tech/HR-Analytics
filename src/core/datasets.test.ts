import { describe, it, expect } from "vitest";
import { ALL_SCHEMAS, getSchema, allTeams, GENERIC_KINDS } from "./datasets";

describe("dataset registry parity", () => {
  it("contains all 14 kinds, employee_master + 13 generic", () => {
    const kinds = ALL_SCHEMAS.map((s) => s.kind);
    expect(kinds).toContain("employee_master");
    expect(kinds).toContain("engagement_survey");
    expect(kinds.length).toBe(14);
    expect(new Set(kinds).size).toBe(14);
    expect(GENERIC_KINDS).not.toContain("employee_master");
    expect(GENERIC_KINDS.length).toBe(13);
  });

  it("every key field and alias maps to a real field", () => {
    for (const s of ALL_SCHEMAS) {
      const cols = new Set(s.fields.map((f) => f.name));
      for (const k of s.keyFields) expect(cols.has(k)).toBe(true);
      for (const canonical of Object.values(s.aliasMap())) expect(cols.has(canonical)).toBe(true);
    }
  });

  it("TA requisition required fields match the Python spec", () => {
    const ta = getSchema("ta_requisition");
    expect([...ta.requiredFields()].sort()).toEqual(
      ["department", "job_title", "open_date", "requisition_id", "status"].sort(),
    );
  });

  it("teams exclude the employee master", () => {
    expect(allTeams()).toEqual(["Talent Acquisition", "Performance", "Payroll", "L&D", "HR Admin", "Engagement", "Planning"]);
  });
});
