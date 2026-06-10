import { describe, it, expect } from "vitest";
import { validateRows, issuesToCsv, checkReferentialIntegrity, checkDuplicateKeys } from "./validate";
import { TA_REQUISITION, PMS_REVIEW, ADMIN_ASSET, EMPLOYEE_MASTER } from "../datasets";

const present = new Set(TA_REQUISITION.columnNames);

describe("checkDuplicateKeys (FIX-4)", () => {
  it("flags the 2nd+ occurrence of a duplicate primary key", () => {
    const cols = new Set(EMPLOYEE_MASTER.columnNames);
    const rows = [{ employee_number: "E1" }, { employee_number: "E2" }, { employee_number: "E1" }, { employee_number: "E1" }];
    const issues = checkDuplicateKeys(EMPLOYEE_MASTER, rows, cols);
    expect(issues).toHaveLength(2); // rows 3 and 4 (E1 repeats); E2 unique
    expect(issues[0].kind).toBe("duplicate_key");
    expect(issues[0].row).toBe(3);
    expect(issues[0].message).toMatch(/first seen at row 1/);
  });

  it("uses the composite key for multi-field keys (same emp + cycle is a dup; same emp, different cycle is not)", () => {
    const cols = new Set(["employee_number", "cycle"]);
    const rows = [{ employee_number: "E1", cycle: "H1" }, { employee_number: "E1", cycle: "H2" }, { employee_number: "E1", cycle: "H1" }];
    const issues = checkDuplicateKeys(PMS_REVIEW, rows, cols); // PMS key = (employee_number, cycle)
    expect(issues).toHaveLength(1); // only the 3rd row (E1/H1 repeats)
    expect(issues[0].row).toBe(3);
  });

  it("ignores rows with an incomplete key (covered by missing_required) and unkeyed schemas", () => {
    const cols = new Set(EMPLOYEE_MASTER.columnNames);
    expect(checkDuplicateKeys(EMPLOYEE_MASTER, [{ employee_number: "" }, { employee_number: "" }], cols)).toHaveLength(0);
    // key column absent from the file → no dup check (compatibility concern, not per-row)
    expect(checkDuplicateKeys(EMPLOYEE_MASTER, [{ full_name: "A" }, { full_name: "A" }], new Set(["full_name"]))).toHaveLength(0);
  });
});

describe("validateRows", () => {
  it("flags a missing required field", () => {
    const { issues, rowsWithIssues } = validateRows(
      TA_REQUISITION,
      [{ requisition_id: "", department: "Tech", job_title: "Eng", status: "Open", open_date: "2026-04-01" }],
      present,
    );
    expect(rowsWithIssues).toBe(1);
    expect(issues.some((i) => i.field === "requisition_id" && i.kind === "missing_required")).toBe(true);
  });

  it("flags an invalid string enum value", () => {
    const { issues } = validateRows(
      TA_REQUISITION,
      [{ requisition_id: "R1", department: "Tech", job_title: "Eng", status: "Maybe", open_date: "2026-04-01" }],
      present,
    );
    const e = issues.find((i) => i.field === "status");
    expect(e?.kind).toBe("invalid_enum");
    expect(e?.message).toContain("Open");
  });

  it("accepts a valid enum case-insensitively", () => {
    const { rowsWithIssues } = validateRows(
      TA_REQUISITION,
      [{ requisition_id: "R1", department: "Tech", job_title: "Eng", status: "open", open_date: "2026-04-01", employment_type: "ft" }],
      present,
    );
    expect(rowsWithIssues).toBe(0);
  });

  it("flags bad numeric and date values", () => {
    const { issues } = validateRows(
      TA_REQUISITION,
      [{ requisition_id: "R1", department: "Tech", job_title: "Eng", status: "Open", open_date: "not-a-date", applications: "lots" }],
      present,
    );
    expect(issues.some((i) => i.field === "open_date" && i.kind === "bad_type")).toBe(true);
    expect(issues.some((i) => i.field === "applications" && i.kind === "bad_type")).toBe(true);
  });

  it("does not flag a required field whose column is absent from the file", () => {
    const onlyKey = new Set(["requisition_id"]);
    const { issues } = validateRows(TA_REQUISITION, [{ requisition_id: "R1" }], onlyKey);
    expect(issues.some((i) => i.kind === "missing_required" && i.field !== "requisition_id")).toBe(false);
  });

  it("validates boolean enums via coercion (Y/N ok, junk flagged)", () => {
    const cols = new Set(PMS_REVIEW.columnNames);
    expect(validateRows(PMS_REVIEW, [{ employee_number: "AA1", cycle: "FY26", goals_set: "Y" }], cols).rowsWithIssues).toBe(0);
    const bad = validateRows(PMS_REVIEW, [{ employee_number: "AA1", cycle: "FY26", goals_set: "maybe" }], cols);
    expect(bad.issues.some((i) => i.field === "goals_set" && i.kind === "invalid_enum")).toBe(true);
  });

  it("flags employee foreign keys absent from the master (orphan_fk)", () => {
    const known = new Set(["AA0001", "AA0002"]);
    const rows = [{ employee_number: "AA0001" }, { employee_number: "ZZ9999" }, { employee_number: "" }];
    const issues = checkReferentialIntegrity(PMS_REVIEW, rows, known);
    expect(issues).toHaveLength(1);
    expect(issues[0].kind).toBe("orphan_fk");
    expect(issues[0].row).toBe(2);
    expect(issues[0].message).toContain("ZZ9999");
  });

  it("checks the assigned-employee FK on assets, and is a no-op without known IDs", () => {
    const rows = [{ asset_id: "A1", assigned_employee_number: "GHOST" }];
    expect(checkReferentialIntegrity(ADMIN_ASSET, rows, new Set(["AA0001"]))).toHaveLength(1);
    expect(checkReferentialIntegrity(ADMIN_ASSET, rows, null)).toHaveLength(0);
    expect(checkReferentialIntegrity(ADMIN_ASSET, rows, new Set())).toHaveLength(0);
  });

  it("renders issues to CSV with a header row", () => {
    const { issues } = validateRows(
      TA_REQUISITION,
      [{ requisition_id: "R1", department: "Tech", job_title: "Eng", status: "Nope", open_date: "2026-04-01" }],
      present,
    );
    const csv = issuesToCsv(issues);
    expect(csv.split("\n")[0]).toBe("Row,Field,Issue,Value,Detail");
    expect(csv).toContain("invalid_enum");
  });
});
