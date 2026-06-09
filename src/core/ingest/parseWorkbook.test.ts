import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook } from "./parseWorkbook";
import { TA_REQUISITION, PMS_REVIEW, EMPLOYEE_MASTER } from "../datasets";
// (EMPLOYEE_MASTER alias coverage extended in FIX-1 s2)

function buildSheet(aoa: unknown[][], sheetName = "Data"): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), sheetName);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function buildXlsx(headers: string[], rows: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function buildCsv(headers: string[], rows: unknown[][]): ArrayBuffer {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

describe("parseWorkbook (TA)", () => {
  it("maps label headers to canonical fields, coerces types, parses period", async () => {
    const headers = TA_REQUISITION.fields.map((fld) => fld.label);
    const row = TA_REQUISITION.fields.map((fld) =>
      fld.name === "requisition_id" ? "REQ-1" :
      fld.name === "department" ? "Tech" :
      fld.name === "job_title" ? "SDE" :
      fld.name === "status" ? "Open" :
      fld.name === "open_date" ? "2026-04-01" :
      fld.name === "applications" ? "50" : "");
    const cand = await parseWorkbook(buildXlsx(headers, [row]), "TA_requisitions_2026-05.xlsx", TA_REQUISITION);
    expect(cand.status).toBe("imported");
    expect(cand.rowCount).toBe(1);
    expect(cand.asOf).toBe("2026-05-31");
    expect(cand.rows[0].requisition_id).toBe("REQ-1");
    expect(cand.rows[0].applications).toBe(50);
    expect(cand.compatibility).toBe("full");
  });

  it("tolerates separator / whitespace drift in headers (underscores, hyphens, double spaces)", async () => {
    const headers = ["Requisition_ID", "  Department ", "Job  Title", "Status", "Open-Date", "Applications"];
    const rows = [["REQ-9", "Tech", "SDE", "Open", "2026-04-01", "12"]];
    const cand = await parseWorkbook(buildXlsx(headers, rows), "TA_requisitions_2026-05.xlsx", TA_REQUISITION);
    expect(cand.status).toBe("imported");
    expect(cand.rows[0].requisition_id).toBe("REQ-9"); // "Requisition_ID" → requisition_id
    expect(cand.rows[0].department).toBe("Tech"); // "  Department " → department
    expect(cand.rows[0].job_title).toBe("SDE"); // "Job  Title" → job_title
    expect(cand.rows[0].open_date).toBe("2026-04-01"); // "Open-Date" → open_date
    expect(cand.rows[0].applications).toBe(12); // coerced
  });

  it("maps SAP/Workday-style employee aliases (Staff ID, Hire Date, Sex, Dept, Title, Company)", async () => {
    const headers = ["Staff ID", "Display Name", "Hire Date", "Sex", "Dept", "Title", "Company", "Work Location"];
    const rows = [["E100", "Asha R", "2021-07-01", "Female", "Finance", "Analyst", "Acme Pvt Ltd", "Pune"]];
    const cand = await parseWorkbook(buildXlsx(headers, rows), "employees.xlsx", EMPLOYEE_MASTER, "2026-05-31");
    expect(cand.status).toBe("imported");
    const r = cand.rows[0];
    expect(r.employee_number).toBe("E100"); // Staff ID
    expect(r.full_name).toBe("Asha R"); // Display Name
    expect(r.date_joined).toBe("2021-07-01"); // Hire Date
    expect(r.gender).toBe("Female"); // Sex
    expect(r.department).toBe("Finance"); // Dept
    expect(r.job_title).toBe("Analyst"); // Title
    expect(r.legal_entity).toBe("Acme Pvt Ltd"); // Company
    expect(r.current_city).toBe("Pune"); // Work Location
  });

  it("surfaces detected headers and imports with a user mapping override (bypassing auto-detection)", async () => {
    const headers = ["Code", "Dept X", "Role X", "State", "Opened", "Apps"]; // none alias cleanly
    const rows = [["REQ-7", "Tech", "SDE", "Open", "2026-04-01", "30"]];
    // Auto-detection fails, but the real headers are still surfaced for manual mapping.
    const auto = await parseWorkbook(buildXlsx(headers, rows), "TA_2026-05.xlsx", TA_REQUISITION);
    expect(auto.status).toBe("rejected");
    expect(auto.detectedHeaders).toEqual(headers);
    // The user's column mapping is applied and the file imports.
    const override = { "Code": "requisition_id", "Dept X": "department", "Role X": "job_title", "State": "status", "Opened": "open_date", "Apps": "applications" };
    const mapped = await parseWorkbook(buildXlsx(headers, rows), "TA_2026-05.xlsx", TA_REQUISITION, undefined, null, undefined, override);
    expect(mapped.status).toBe("imported");
    expect(mapped.rows[0].requisition_id).toBe("REQ-7");
    expect(mapped.rows[0].department).toBe("Tech");
    expect(mapped.rows[0].job_title).toBe("SDE");
    expect(mapped.rows[0].applications).toBe(30);
  });

  it("rejects an unrelated sheet", async () => {
    const cand = await parseWorkbook(buildXlsx(["totally", "unrelated"], [[1, 2]]), "x_2026-05.xlsx", TA_REQUISITION);
    expect(cand.status).toBe("rejected");
  });

  it("flags an orphan employee FK against the known master IDs", async () => {
    const cand = await parseWorkbook(
      buildXlsx(["Employee Number", "Review Cycle"], [["AA0001", "FY26-H1"], ["ZZ9999", "FY26-H1"]]),
      "PMS_cycle_FY26-H1.xlsx",
      PMS_REVIEW,
      "2026-05-31",
      new Set(["AA0001"]),
    );
    const orphan = cand.issues.filter((i) => i.kind === "orphan_fk");
    expect(orphan).toHaveLength(1);
    expect(orphan[0].message).toContain("ZZ9999");
  });

  it("imports a Keka 'All Employees' export: banner/footer skipped, headers aliased, status defaulted, as-of from footer", async () => {
    const aoa: unknown[][] = [
      ["airpay"], // row 1 — company banner
      ["All Employees"], // row 2 — report title
      ["Employee Number", "Full Name", "Email", "Date of Joining", "Job Title", "Business Unit", "Department", "Sub Department", "Location", "Cost Center", "Legal Entity", "Band", "Reporting To", "Dotted Line Manager"], // row 3 — header
      ["00001", "Kunal J", "k@x.com", "2012-04-08", "Founder", "Airpay", "Management", "HOD", "Mumbai", null, "Airpay Payment Services Pvt Ltd", null, "Kunal J", null],
      ["Intern - 9", "Melwin D", "m@x.com", "2026-05-04", "Intern", "Airpay", "Technology", "Engineering", "Pune", null, "Airpay Payment Services Pvt Ltd", null, "Some Mgr", null],
      [], // a blank row before the footer
      ["Generated on 04 Jun 2026", null, "This report is generated by Keka HR and Payroll Software"], // footer
    ];
    // Filename has no date — the as-of must come from the footer.
    const cand = await parseWorkbook(buildSheet(aoa, "All Employees"), "All Employees - airpay (5).xlsx", EMPLOYEE_MASTER);
    expect(cand.status).toBe("imported");
    expect(cand.rowCount).toBe(2); // banner, blank and footer all excluded
    expect(cand.asOf).toBe("2026-06-04"); // harvested from "Generated on 04 Jun 2026"
    expect(cand.detectedSheet).toBe("All Employees");
    const a = cand.rows[0];
    expect(a.employee_number).toBe("00001"); // leading zeros preserved (string)
    expect(a.work_email).toBe("k@x.com"); // Email -> work_email
    expect(a.date_joined).toBe("2012-04-08"); // Date of Joining -> date_joined
    expect(a.current_city).toBe("Mumbai"); // Location -> current_city
    expect(a.reporting_manager).toBe("Kunal J"); // Reporting To -> reporting_manager
    expect(a.legal_entity).toBe("Airpay Payment Services Pvt Ltd");
    expect(cand.rows.every((r) => r.employment_status === "Working")).toBe(true); // defaulted (no status column)
    expect(cand.availableColumns.includes("employment_status")).toBe(true);
  });

  it("imports a full-schema 'Employee report … as on 5th May' by resolving the year from today", async () => {
    const header = EMPLOYEE_MASTER.fields.map((fld) => fld.label); // canonical headers, incl. Gender/Employment Status
    const row = (n: string, gender: string, status: string) => EMPLOYEE_MASTER.fields.map((fld) =>
      fld.name === "employee_number" ? n : fld.name === "full_name" ? "Person " + n : fld.name === "gender" ? gender : fld.name === "employment_status" ? status : fld.name === "department" ? "Tech" : fld.name === "date_joined" ? "2020-01-01" : "");
    const cand = await parseWorkbook(
      buildSheet([header, row("1", "Male", "Working"), row("2", "Female", "Relieved")], "Employee report for L&D team"),
      "15. Employee report for L&D team-airpay- as on 5th May (1).xlsx",
      EMPLOYEE_MASTER,
      undefined,
      null,
      "2026-06-04", // today → "5th May" resolves to 2026-05-05
    );
    expect(cand.status).toBe("imported");
    expect(cand.asOf).toBe("2026-05-05");
    expect(cand.compatibility).toBe("full");
    expect(cand.rows[0].gender).toBe("Male");
    expect(cand.rows[1].employment_status).toBe("Relieved"); // real status used, not defaulted
    expect(cand.notes.join(" ")).toMatch(/inferred from the filename/i);
  });

  it("parses a .csv file and surfaces row-level validation issues", async () => {
    const headers = ["Requisition ID", "Department", "Job Title", "Status", "Open Date", "Applications"];
    const rows = [
      ["REQ-1", "Tech", "SDE", "Open", "2026-04-01", "50"],
      ["REQ-2", "Tech", "SDE", "Maybe", "2026-04-02", "oops"], // bad enum + bad number
    ];
    const cand = await parseWorkbook(buildCsv(headers, rows), "TA_requisitions_2026-05.csv", TA_REQUISITION);
    expect(cand.status).toBe("imported");
    expect(cand.rowCount).toBe(2);
    expect(cand.asOf).toBe("2026-05-31");
    expect(cand.rowsWithIssues).toBe(1);
    expect(cand.issues.some((i) => i.field === "status" && i.kind === "invalid_enum")).toBe(true);
    expect(cand.issues.some((i) => i.field === "applications" && i.kind === "bad_type")).toBe(true);
  });
});
