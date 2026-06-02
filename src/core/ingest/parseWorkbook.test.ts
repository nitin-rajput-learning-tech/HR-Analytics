import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook } from "./parseWorkbook";
import { TA_REQUISITION } from "../datasets";

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

  it("rejects an unrelated sheet", async () => {
    const cand = await parseWorkbook(buildXlsx(["totally", "unrelated"], [[1, 2]]), "x_2026-05.xlsx", TA_REQUISITION);
    expect(cand.status).toBe("rejected");
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
