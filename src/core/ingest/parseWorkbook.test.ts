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
});
