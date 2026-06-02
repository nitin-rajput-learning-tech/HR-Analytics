import { describe, it, expect } from "vitest";
import { validateRows, issuesToCsv, checkReferentialIntegrity } from "./validate";
import { TA_REQUISITION, PMS_REVIEW, ADMIN_ASSET } from "../datasets";

const present = new Set(TA_REQUISITION.columnNames);

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
