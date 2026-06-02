import { describe, it, expect } from "vitest";
import { buildPayEquity } from "./pay_equity";
import type { Row } from "../ingest/types";

const empRow = (n: string, gender: string, dept: string): Row => ({ employee_number: n, gender, department: dept, employment_status: "Working" });
const pay = (n: string, gross: number): Row => ({ employee_number: n, gross_monthly: gross });

// Tech: 4 women @ ~90k, 4 men @ ~110k → clear gap. Sales: balanced ~100k → no gap.
function fixture() {
  const employeeRows: Row[] = [];
  const payrollRows: Row[] = [];
  const add = (n: string, g: string, d: string, gross: number) => { employeeRows.push(empRow(n, g, d)); payrollRows.push(pay(n, gross)); };
  ["F1", "F2", "F3", "F4"].forEach((n, i) => add(n, "Female", "Tech", 88000 + i * 1000));
  ["M1", "M2", "M3", "M4"].forEach((n, i) => add(n, "Male", "Tech", 108000 + i * 1000));
  ["SF1", "SF2", "SF3"].forEach((n, i) => add(n, "Female", "Sales", 100000 + i * 1000));
  ["SM1", "SM2", "SM3"].forEach((n, i) => add(n, "Male", "Sales", 100000 + i * 1000));
  return { employeeRows, payrollRows };
}

describe("buildPayEquity", () => {
  it("shows an awaiting state when there is no per-employee payroll", () => {
    const d = buildPayEquity({ employeeRows: [empRow("E1", "Female", "Tech")], payrollRows: null });
    expect(d.hasData).toBe(false);
    expect(d.blurb).toMatch(/per-employee pay/i);
  });

  it("computes the overall gender pay gap and flags departments over 5%", () => {
    const d = buildPayEquity(fixture());
    expect(d.hasData).toBe(true);
    const kpi = Object.fromEntries(d.kpis.map((k) => [k.label, k.value]));
    // Tech women median ~89.5k vs men ~109.5k ≈ 18% gap; Sales ~0 → overall positive
    expect(parseFloat(kpi["Gender Pay Gap"])).toBeGreaterThan(5);
    expect(kpi["Depts > 5% Gap"]).toBe("1"); // Tech flagged, Sales not
    expect(d.watchouts.some((w) => /Tech/.test(w.title))).toBe(true);
  });

  it("estimates a positive remediation cost when a gap exists", () => {
    const d = buildPayEquity(fixture());
    const rem = d.kpis.find((k) => k.label === "Est. Remediation");
    expect(rem).toBeTruthy();
    // 4 Tech women raised to the men's median (~109.5k) → clearly > 0
    expect(/₹/.test(rem!.value)).toBe(true);
    expect(rem!.value).not.toBe("₹0");
  });

  it("requires both genders present to compare", () => {
    const rows = ["A", "B", "C"].map((n) => empRow(n, "Female", "Tech"));
    const payroll = ["A", "B", "C"].map((n) => pay(n, 90000));
    expect(buildPayEquity({ employeeRows: rows, payrollRows: payroll }).hasData).toBe(false);
  });
});
