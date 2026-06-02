// Generate imaginary functional data (TA, PMS, Payroll, L&D, Admin) keyed to a
// real employee master — every row references actual employee_numbers and
// departments so joins and cross-functional risk are organisation-consistent.
// Also synthesises a prior employee month so Movement & Forecast work.
// Pure + deterministic (seeded). For demo/eval before real functional data.

import type { Row } from "../ingest/types";

export interface DemoSnapshot {
  kind: string;
  asOf: string;
  periodLabel: string;
  rows: Row[];
}

let seed = 1;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
const pad = (n: number) => String(n).padStart(2, "0");
const str = (v: unknown) => String(v ?? "").trim();
const isWorking = (r: Row) => str(r["employment_status"]) === "Working";

function shiftMonth(iso: string, delta: number): string {
  const base = /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : "2026-05-05";
  const d = new Date(base + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}

const PROGRAMS = [
  { program_id: "LDP-001", program_name: "POSH & Code of Conduct", category: "Compliance", total_cost: 120000, planned_participants: 200 },
  { program_id: "LDP-002", program_name: "Information Security Essentials", category: "Mandatory", total_cost: 90000, planned_participants: 200 },
  { program_id: "LDP-003", program_name: "PCI-DSS Awareness", category: "Compliance", total_cost: 110000, planned_participants: 150 },
  { program_id: "LDP-004", program_name: "Manager Essentials", category: "Leadership", total_cost: 260000, planned_participants: 40 },
  { program_id: "LDP-005", program_name: "Advanced Excel", category: "Functional", total_cost: 80000, planned_participants: 30 },
  { program_id: "LDP-006", program_name: "Consultative Selling", category: "Functional", total_cost: 150000, planned_participants: 35 },
  { program_id: "LDP-007", program_name: "New Hire Onboarding", category: "Onboarding", total_cost: 80000, planned_participants: 60 },
  { program_id: "LDP-008", program_name: "Data Privacy (DPDP Act)", category: "Compliance", total_cost: 100000, planned_participants: 200 },
  { program_id: "LDP-009", program_name: "Leadership Bootcamp", category: "Leadership", total_cost: 320000, planned_participants: 20 },
  { program_id: "LDP-010", program_name: "Customer Service Excellence", category: "Functional", total_cost: 90000, planned_participants: 40 },
];
const MODES = ["Classroom", "Virtual", "Self-paced"];
const SOURCES = ["Referral", "Agency", "Portal", "Internal", "Direct"];
const CONTRACT_CATS = ["Facilities", "IT", "Insurance", "License", "Other"];

export function generateFunctionalDemo(employeeRows: Row[], asOf: string): DemoSnapshot[] {
  seed = 20260505;
  const active = employeeRows.filter(isWorking);
  const relieved = employeeRows.filter((r) => str(r["employment_status"]) === "Relieved");
  if (!active.length) return [];
  const month = asOf.slice(0, 7);
  const entity = str(active[0]["legal_entity"]) || "Acme";
  const depts = [...new Set(active.map((r) => str(r["department"]) || "Unspecified"))];
  const titleByDept = (d: string) => {
    const sample = active.find((r) => (str(r["department"]) || "Unspecified") === d);
    return sample ? str(sample["job_title"]) || "Executive" : "Executive";
  };
  const out: DemoSnapshot[] = [];

  // --- Talent Acquisition
  const taRows: Row[] = [];
  const reqCount = Math.min(40, Math.max(10, Math.round(depts.length * 1.4)));
  for (let i = 1; i <= reqCount; i++) {
    const dept = pick(depts);
    const apps = int(40, 220);
    const sh = Math.round(apps * (0.15 + rnd() * 0.15));
    const iv = Math.round(sh * (0.4 + rnd() * 0.3));
    const om = Math.max(1, Math.round(iv * (0.2 + rnd() * 0.2)));
    const oa = Math.round(om * (0.55 + rnd() * 0.35));
    const status = pick(["Open", "Open", "On-hold", "Filled", "Filled", "Cancelled"]);
    taRows.push({
      requisition_id: `REQ-${month}-${pad(i)}`, department: dept, sub_department: "", job_title: titleByDept(dept),
      level_grade: `L${int(2, 6)}`, location: pick(["Mumbai", "Pune", "Bengaluru", "Delhi", "Remote"]), hiring_manager: "",
      employment_type: pick(["FT", "FT", "FT", "Contract", "Intern"]), status,
      open_date: shiftMonth(asOf, i <= 4 ? -6 : -2), target_join_date: shiftMonth(asOf, 1),
      applications: apps, shortlisted: sh, interviewed: iv, offers_made: om, offers_accepted: oa,
      joined: status === "Filled" ? oa : Math.max(0, oa - int(0, 1)), primary_source: pick(SOURCES), recruiter: "", cost: int(20000, 120000),
    });
  }
  out.push({ kind: "ta_requisition", asOf, periodLabel: month, rows: taRows });

  // --- Performance (PMS), keyed to active employees
  const pms: Row[] = active.map((e) => {
    const done = chance(0.85);
    const rating = pick([2, 3, 3, 3, 4, 4, 4, 5]);
    const pip = chance(0.05);
    return {
      employee_number: str(e["employee_number"]), cycle: "FY26-H1", goals_set: "Y", goal_set_date: "",
      self_review_done: chance(0.9) ? "Y" : "N", manager_review_done: done ? "Y" : "N",
      final_rating: done ? rating : "", rating_scale: "1-5", calibrated: done && chance(0.9) ? "Y" : "N",
      potential_rating: pick(["High", "Medium", "Medium", "Low"]),
      promotion_recommended: rating >= 4 && chance(0.3) ? "Y" : "N",
      on_pip: pip ? "Y" : "N", pip_start_date: "", pip_outcome: pip ? pick(["Open", "Successful", "Exited"]) : "",
    };
  });
  out.push({ kind: "pms_review", asOf, periodLabel: "FY26-H1", rows: pms });

  // --- Payroll aggregate (per dept) + statutory
  const payAgg: Row[] = depts.map((d) => {
    const heads = active.filter((r) => (str(r["department"]) || "Unspecified") === d).length;
    const gross = heads * int(60000, 160000);
    return {
      pay_month: month, department: d, legal_entity: entity, headcount_paid: heads, total_gross: gross,
      total_variable: Math.round(gross * 0.1), total_overtime: chance(0.3) ? Math.round(gross * 0.02) : 0,
      error_count: pick([0, 0, 0, 1, 2]), off_cycle_count: pick([0, 0, 1]),
    };
  });
  out.push({ kind: "payroll_aggregate", asOf, periodLabel: month, rows: payAgg });

  // --- Payroll record (per-employee): base-by-dept × tenure, with a deliberate
  // ~10% gender factor so the Pay Equity module has a realistic gap to surface
  // (demo only — illustrative, not a claim about any real organisation).
  const deptBase = new Map<string, number>();
  for (const d of depts) deptBase.set(d, int(60000, 150000));
  const payRec: Row[] = active.map((e) => {
    const base = deptBase.get(str(e["department"]) || "Unspecified") ?? 90000;
    const g = str(e["gender"]).toLowerCase();
    const genderFactor = g === "female" ? 0.88 + rnd() * 0.06 : g === "male" ? 0.99 + rnd() * 0.06 : 0.95 + rnd() * 0.06;
    const gross = Math.round((base * genderFactor * (0.9 + rnd() * 0.35)) / 1000) * 1000;
    return {
      employee_number: str(e["employee_number"]), pay_month: month, ctc_annual: gross * 12, gross_monthly: gross,
      fixed_pay: Math.round(gross * 0.85), variable_pay_paid: Math.round(gross * 0.15), overtime_hours: chance(0.15) ? int(2, 20) : 0,
      overtime_amount: 0, total_deductions: Math.round(gross * 0.15), net_pay: Math.round(gross * 0.85),
      payroll_status: chance(0.98) ? "Paid" : pick(["Held", "Error"]), off_cycle: chance(0.05) ? "Y" : "N", last_revision_date: "",
    };
  });
  out.push({ kind: "payroll_record", asOf, periodLabel: month, rows: payRec });
  out.push({
    kind: "payroll_statutory", asOf, periodLabel: month,
    rows: [
      { pay_month: month, statutory_type: "PF", due_date: "", paid_date: "", amount: int(1000000, 3000000), status: "Paid" },
      { pay_month: month, statutory_type: "ESI", due_date: "", paid_date: "", amount: int(200000, 500000), status: "Paid" },
      { pay_month: month, statutory_type: "PT", due_date: "", paid_date: "", amount: int(50000, 150000), status: "Paid" },
      { pay_month: month, statutory_type: "TDS", due_date: "", paid_date: "", amount: int(2000000, 4000000), status: chance(0.5) ? "Late" : "Paid" },
      { pay_month: month, statutory_type: "LWF", due_date: "", paid_date: "", amount: int(10000, 30000), status: "Pending" },
    ],
  });

  // --- L&D programs + enrollments
  out.push({
    kind: "ld_program", asOf, periodLabel: month,
    rows: PROGRAMS.map((p) => ({ ...p, mode: pick(MODES), start_date: shiftMonth(asOf, -1), end_date: asOf, trainer_vendor: pick(["Internal L&D", "UpGrad", "Coursera", "LinkedIn Learning"]) })),
  });
  const ld: Row[] = [];
  for (const e of active) {
    if (!chance(0.6)) continue;
    const chosen = new Set<string>();
    const c = int(1, 3);
    for (let k = 0; k < c; k++) chosen.add(pick(PROGRAMS).program_id);
    for (const pid of chosen) {
      const prog = PROGRAMS.find((p) => p.program_id === pid)!;
      const compliance = prog.category === "Mandatory" || prog.category === "Compliance";
      const status = chance(compliance ? 0.85 : 0.7) ? "Completed" : pick(["Enrolled", "In-progress", "Dropped"]);
      const done = status === "Completed";
      ld.push({ employee_number: str(e["employee_number"]), program_id: pid, enrolled_date: shiftMonth(asOf, -1), status, completion_date: done ? asOf : "", duration_hours: int(2, 16), assessment_score: done ? int(55, 98) : "", feedback_score: done ? 3 + Math.round(rnd() * 20) / 10 : "" });
    }
  }
  out.push({ kind: "ld_enrollment", asOf, periodLabel: month, rows: ld });

  // --- HR Admin: assets, contracts, lifecycle
  const assets: Row[] = [];
  let aid = 1000;
  for (const e of active) {
    if (!chance(0.95)) continue;
    aid += 1;
    assets.push({ asset_id: `AST-${aid}`, asset_type: "Laptop", assigned_employee_number: str(e["employee_number"]), assign_date: str(e["date_joined"]), return_date: "", status: "Allocated", value: int(45000, 110000) });
    if (chance(0.4)) {
      aid += 1;
      assets.push({ asset_id: `AST-${aid}`, asset_type: pick(["Phone", "Access Card", "SIM"]), assigned_employee_number: str(e["employee_number"]), assign_date: str(e["date_joined"]), return_date: "", status: "Allocated", value: int(2000, 60000) });
    }
  }
  for (let i = 0; i < 5; i++) { aid += 1; assets.push({ asset_id: `AST-${aid}`, asset_type: pick(["Laptop", "Phone"]), assigned_employee_number: "", assign_date: "", return_date: "", status: "Lost", value: int(20000, 90000) }); }
  out.push({ kind: "admin_asset", asOf, periodLabel: month, rows: assets });

  const expiries = [shiftMonth(asOf, -1), shiftMonth(asOf, -2), shiftMonth(asOf, 0), shiftMonth(asOf, 1), shiftMonth(asOf, 2), shiftMonth(asOf, 3)];
  const contracts: Row[] = [];
  for (let i = 1; i <= 16; i++) {
    contracts.push({ contract_id: `CON-${pad(i)}`, vendor_name: `${pick(["Acme", "Zenith", "Pinnacle", "Vertex", "Summit"])} ${pick(["Facilities", "Tech", "Insurance", "Services"])} Pvt Ltd`, category: pick(CONTRACT_CATS), start_date: shiftMonth(asOf, -int(12, 36)), expiry_date: i <= expiries.length ? expiries[i - 1] : shiftMonth(asOf, int(4, 9)), annual_cost: int(200000, 1500000), renewal_status: pick(["Auto", "In-progress", "Pending", "Pending"]), owner: "Admin Team" });
  }
  out.push({ kind: "admin_contract", asOf, periodLabel: month, rows: contracts });

  const life: Row[] = [];
  for (const e of active.slice(0, 12)) life.push({ employee_number: str(e["employee_number"]), type: "Onboarding", start_date: asOf, checklist_complete: chance(0.8) ? "Y" : "N", pending_items: chance(0.7) ? "" : "ID card; email", asset_recovered: "" });
  for (const e of relieved.slice(0, 10)) life.push({ employee_number: str(e["employee_number"]), type: "Offboarding", start_date: asOf, checklist_complete: chance(0.7) ? "Y" : "N", pending_items: chance(0.6) ? "" : "FnF pending", asset_recovered: chance(0.6) ? "Y" : "N" });
  out.push({ kind: "admin_lifecycle", asOf, periodLabel: month, rows: life });

  return out;
}

// Synthesise a prior employee month so Movement & Forecast have something to diff.
export function generatePriorEmployeeMonth(employeeRows: Row[], asOf: string): DemoSnapshot | null {
  seed = 4242;
  const active = employeeRows.filter(isWorking);
  const relieved = employeeRows.filter((r) => str(r["employment_status"]) === "Relieved");
  if (active.length < 5) return null;
  const prior = shiftMonth(asOf, -1);
  // ~4% of current active "joined" this month (so absent in prior); ~3% of the
  // relieved "left" this month (so shown active in prior).
  const joiners = new Set(active.slice(0, Math.max(1, Math.round(active.length * 0.04))).map((r) => str(r["employee_number"])));
  const leavers = new Set(relieved.slice(0, Math.max(1, Math.round(relieved.length * 0.03))).map((r) => str(r["employee_number"])));
  const rows = employeeRows
    .filter((r) => !joiners.has(str(r["employee_number"])))
    .map((r) => (leavers.has(str(r["employee_number"])) ? { ...r, employment_status: "Working", last_working_day: "" } : r));
  return { kind: "employee_master", asOf: prior, periodLabel: prior, rows };
}
