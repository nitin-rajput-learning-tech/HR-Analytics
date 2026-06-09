import { describe, it, expect } from "vitest";
import { suggestColumnMapping, validateColumnMapping } from "./mapping";
import { EMPLOYEE_MASTER, TA_REQUISITION } from "../datasets";

describe("suggestColumnMapping", () => {
  it("auto-maps recognised headers and lists the unrecognised ones", () => {
    const s = suggestColumnMapping(["Staff ID", "Full Name", "Sex", "Department", "Mystery Column"], EMPLOYEE_MASTER);
    expect(s.mapping["Staff ID"]).toBe("employee_number"); // alias
    expect(s.mapping["Full Name"]).toBe("full_name"); // label
    expect(s.mapping["Sex"]).toBe("gender"); // alias
    expect(s.mapping["Department"]).toBe("department");
    expect(s.mapping["Mystery Column"]).toBeNull();
    expect(s.unmappedHeaders).toEqual(["Mystery Column"]);
  });

  it("flags required fields with no mapping", () => {
    // TA template requires requisition_id, department, job_title, status, open_date.
    const s = suggestColumnMapping(["Requisition ID", "Department", "Job Title", "Open Date"], TA_REQUISITION);
    expect(s.missingRequired).toContain("status"); // no Status header supplied
    expect(s.missingRequired).not.toContain("requisition_id"); // present
  });

  it("claims each field once — a second header aliasing the same field is left unmapped", () => {
    const s = suggestColumnMapping(["Employee Number", "Staff ID"], EMPLOYEE_MASTER); // both → employee_number
    expect(s.mapping["Employee Number"]).toBe("employee_number");
    expect(s.mapping["Staff ID"]).toBeNull();
  });
});

describe("validateColumnMapping", () => {
  it("errors when two headers map to one field, or a target field is invalid", () => {
    const v = validateColumnMapping({ "Col A": "department", "Col B": "department", "Col C": "not_a_field" }, EMPLOYEE_MASTER);
    expect(v.errors.some((e) => /mapped from 2 columns/.test(e))).toBe(true);
    expect(v.errors.some((e) => /not a field/.test(e))).toBe(true);
  });

  it("reports required fields still missing and the set of mapped fields", () => {
    const v = validateColumnMapping({ "Requisition ID": "requisition_id", "Department": "department" }, TA_REQUISITION);
    expect(v.mappedFields).toContain("requisition_id");
    expect(v.missingRequired).toContain("status"); // required, unmapped
    expect(v.errors).toEqual([]); // no ambiguity / invalid targets
  });
});
