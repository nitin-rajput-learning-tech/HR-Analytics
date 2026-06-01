// Dataset-kind registry — the single source of truth for every HR data domain.
// Ported 1:1 from the Python `datasets.py`. Pure data + helpers; no I/O.

export type DType = "string" | "integer" | "number" | "date" | "boolean";

export interface DatasetField {
  name: string;
  label: string;
  dtype: DType;
  required?: boolean;
  allowed?: readonly string[];
  example?: string;
  note?: string;
}

export class DatasetSchema {
  constructor(
    readonly kind: string,
    readonly label: string,
    readonly team: string,
    readonly periodKind: "month" | "cycle" | "as_of",
    readonly fields: readonly DatasetField[],
    readonly keyFields: readonly string[],
    readonly headerAliases: Readonly<Record<string, string>> = {},
    readonly filenameHint = "",
    readonly description = "",
    readonly grain: "detail" | "aggregate" = "detail",
  ) {}

  get tableName(): string {
    return `${this.kind}_snapshots`;
  }
  get columnNames(): string[] {
    return this.fields.map((f) => f.name);
  }
  requiredFields(): Set<string> {
    return new Set(this.fields.filter((f) => f.required).map((f) => f.name));
  }
  field(name: string): DatasetField | undefined {
    return this.fields.find((f) => f.name === name);
  }
  aliasMap(): Record<string, string> {
    const m: Record<string, string> = {};
    for (const f of this.fields) {
      m[f.name.toLowerCase()] = f.name;
      m[f.label.toLowerCase()] = f.name;
    }
    for (const [raw, canon] of Object.entries(this.headerAliases)) m[raw.toLowerCase()] = canon;
    return m;
  }
}

type FieldOpts = { required?: boolean; allowed?: readonly string[]; example?: string; note?: string };
const f = (name: string, label: string, dtype: DType = "string", opts: FieldOpts = {}): DatasetField => ({
  name,
  label,
  dtype,
  ...opts,
});

// --------------------------------------------------------------- employee master
const EMPLOYEE_COLUMNS = [
  "employee_number", "full_name", "legal_entity", "last_working_day", "current_city", "work_phone",
  "work_email", "exit_requested_on", "sub_department", "gender", "date_joined", "employment_status",
  "job_title", "l2_manager", "reporting_manager", "department",
] as const;

const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const EMPLOYEE_DATE_FIELDS = new Set(["last_working_day", "exit_requested_on", "date_joined"]);

export const EMPLOYEE_MASTER = new DatasetSchema(
  "employee_master", "Employee Master", "Core People", "as_of",
  EMPLOYEE_COLUMNS.map((n) => f(n, titleCase(n), EMPLOYEE_DATE_FIELDS.has(n) ? "date" : "string")),
  ["employee_number"], {}, "Employee report ... as on <date>.xlsx",
  "Monthly employee roster — the spine every other domain joins to.",
);

// --------------------------------------------------------------- Talent Acquisition
export const TA_REQUISITION = new DatasetSchema(
  "ta_requisition", "Talent Acquisition — Requisitions", "Talent Acquisition", "month",
  [
    f("requisition_id", "Requisition ID", "string", { required: true, example: "REQ-2026-0042" }),
    f("department", "Department", "string", { required: true, example: "Technology" }),
    f("sub_department", "Sub Department", "string", { example: "Backend Engineering" }),
    f("job_title", "Job Title", "string", { required: true, example: "Senior Software Engineer" }),
    f("level_grade", "Level / Grade", "string", { example: "L4" }),
    f("location", "Location", "string", { example: "Mumbai" }),
    f("hiring_manager", "Hiring Manager", "string", { example: "Priyanka Dalvi" }),
    f("employment_type", "Employment Type", "string", { allowed: ["FT", "Contract", "Intern"], example: "FT" }),
    f("status", "Status", "string", { required: true, allowed: ["Open", "On-hold", "Filled", "Cancelled"], example: "Open" }),
    f("open_date", "Open Date", "date", { required: true, example: "2026-04-01" }),
    f("target_join_date", "Target Join Date", "date", { example: "2026-06-01" }),
    f("applications", "Applications", "integer", { example: "120" }),
    f("shortlisted", "Shortlisted", "integer", { example: "24" }),
    f("interviewed", "Interviewed", "integer", { example: "10" }),
    f("offers_made", "Offers Made", "integer", { example: "2" }),
    f("offers_accepted", "Offers Accepted", "integer", { example: "1" }),
    f("joined", "Joined", "integer", { example: "1" }),
    f("primary_source", "Primary Source", "string", { allowed: ["Referral", "Agency", "Portal", "Internal", "Direct"], example: "Referral" }),
    f("recruiter", "Recruiter", "string", { example: "Aarti Shah" }),
    f("cost", "Cost (INR)", "number", { example: "45000", note: "Optional — total sourcing/recruiting cost for the requisition." }),
  ],
  ["requisition_id"],
  {
    "req id": "requisition_id", "requisition": "requisition_id", "req": "requisition_id",
    "grade": "level_grade", "level": "level_grade", "ttf": "target_join_date",
    "source": "primary_source", "apps": "applications", "offers": "offers_made", "accepted": "offers_accepted",
  },
  "TA_requisitions_YYYY-MM.xlsx",
  "One row per requisition with funnel counts. Drives time-to-fill, offer-drop, funnel conversion, source mix and hiring-vs-plan.",
);

export const TA_AGGREGATE = new DatasetSchema(
  "ta_aggregate", "Talent Acquisition — Monthly Aggregate", "Talent Acquisition", "month",
  [
    f("month", "Month", "string", { required: true, example: "2026-05" }),
    f("department", "Department", "string", { required: true, example: "Technology" }),
    f("open_reqs", "Open Requisitions", "integer", { example: "8" }),
    f("filled", "Filled", "integer", { example: "3" }),
    f("avg_time_to_fill_days", "Avg Time-to-Fill (days)", "number", { example: "41" }),
    f("offers_made", "Offers Made", "integer", { example: "5" }),
    f("offers_accepted", "Offers Accepted", "integer", { example: "3" }),
    f("joined", "Joined", "integer", { example: "3" }),
  ],
  ["month", "department"], {}, "TA_aggregate_YYYY-MM.xlsx",
  "Department-level monthly hiring totals for teams that cannot share per-requisition detail.",
  "aggregate",
);

// --------------------------------------------------------------- Performance / PMS
export const PMS_REVIEW = new DatasetSchema(
  "pms_review", "Performance — Review Cycle", "Performance", "cycle",
  [
    f("employee_number", "Employee Number", "string", { required: true, example: "AA0001" }),
    f("cycle", "Review Cycle", "string", { required: true, example: "FY26-H1" }),
    f("goals_set", "Goals Set", "boolean", { allowed: ["Y", "N"], example: "Y" }),
    f("goal_set_date", "Goal Set Date", "date", { example: "2026-04-10" }),
    f("self_review_done", "Self Review Done", "boolean", { allowed: ["Y", "N"], example: "Y" }),
    f("manager_review_done", "Manager Review Done", "boolean", { allowed: ["Y", "N"], example: "Y" }),
    f("final_rating", "Final Rating", "number", { example: "4", note: "Numeric on the stated rating scale." }),
    f("rating_scale", "Rating Scale", "string", { example: "1-5", note: "e.g. 1-5 (5 = highest)." }),
    f("calibrated", "Calibrated", "boolean", { allowed: ["Y", "N"], example: "Y" }),
    f("potential_rating", "Potential Rating", "string", { allowed: ["High", "Medium", "Low"], example: "High", note: "Optional — enables the 9-box grid." }),
    f("promotion_recommended", "Promotion Recommended", "boolean", { allowed: ["Y", "N"], example: "N" }),
    f("on_pip", "On PIP", "boolean", { allowed: ["Y", "N"], example: "N" }),
    f("pip_start_date", "PIP Start Date", "date", { example: "" }),
    f("pip_outcome", "PIP Outcome", "string", { allowed: ["Open", "Successful", "Exited"], example: "" }),
  ],
  ["employee_number", "cycle"],
  {
    "emp no": "employee_number", "emp id": "employee_number", "employee id": "employee_number",
    "rating": "final_rating", "potential": "potential_rating", "pip": "on_pip",
  },
  "PMS_cycle_<CYCLE>.xlsx (e.g. PMS_cycle_FY26-H1.xlsx)",
  "One row per employee per review cycle. Drives completion %, rating distribution, 9-box, PIP and high-performer retention.",
);

// --------------------------------------------------------------- Payroll
export const PAYROLL_RECORD = new DatasetSchema(
  "payroll_record", "Payroll — Per-Employee Detail", "Payroll", "month",
  [
    f("employee_number", "Employee Number", "string", { required: true, example: "AA0001" }),
    f("pay_month", "Pay Month", "string", { required: true, example: "2026-05" }),
    f("ctc_annual", "CTC (Annual, INR)", "number", { example: "1800000" }),
    f("gross_monthly", "Gross (Monthly, INR)", "number", { example: "150000" }),
    f("fixed_pay", "Fixed Pay", "number", { example: "135000" }),
    f("variable_pay_paid", "Variable Pay Paid", "number", { example: "15000" }),
    f("overtime_hours", "Overtime Hours", "number", { example: "0" }),
    f("overtime_amount", "Overtime Amount", "number", { example: "0" }),
    f("total_deductions", "Total Deductions", "number", { example: "22000" }),
    f("net_pay", "Net Pay", "number", { example: "128000" }),
    f("payroll_status", "Payroll Status", "string", { allowed: ["Paid", "Held", "Error"], example: "Paid" }),
    f("off_cycle", "Off-cycle Payment", "boolean", { allowed: ["Y", "N"], example: "N" }),
    f("last_revision_date", "Last Revision Date", "date", { example: "" }),
  ],
  ["employee_number", "pay_month"],
  { "emp no": "employee_number", "month": "pay_month", "ctc": "ctc_annual", "gross": "gross_monthly" },
  "Payroll_YYYY-MM.xlsx",
  "Per-employee monthly pay. Most sensitive — teams may submit the Aggregate sheet instead.",
);

export const PAYROLL_AGGREGATE = new DatasetSchema(
  "payroll_aggregate", "Payroll — Department Aggregate", "Payroll", "month",
  [
    f("pay_month", "Pay Month", "string", { required: true, example: "2026-05" }),
    f("department", "Department", "string", { required: true, example: "Technology" }),
    f("legal_entity", "Legal Entity", "string", { required: true, example: "Airpay Payment Services Pvt Ltd" }),
    f("headcount_paid", "Headcount Paid", "integer", { example: "120" }),
    f("total_gross", "Total Gross (INR)", "number", { example: "18000000" }),
    f("total_variable", "Total Variable (INR)", "number", { example: "1500000" }),
    f("total_overtime", "Total Overtime (INR)", "number", { example: "50000" }),
    f("error_count", "Payroll Error Count", "integer", { example: "1" }),
    f("off_cycle_count", "Off-cycle Count", "integer", { example: "2" }),
  ],
  ["pay_month", "department", "legal_entity"], {}, "Payroll_aggregate_YYYY-MM.xlsx",
  "Department/entity payroll totals — no individual salaries. Lowest-risk option.",
  "aggregate",
);

export const PAYROLL_STATUTORY = new DatasetSchema(
  "payroll_statutory", "Payroll — Statutory Compliance", "Payroll", "month",
  [
    f("pay_month", "Pay Month", "string", { required: true, example: "2026-05" }),
    f("statutory_type", "Statutory Type", "string", { required: true, allowed: ["PF", "ESI", "PT", "TDS", "LWF"], example: "PF" }),
    f("due_date", "Due Date", "date", { example: "2026-06-15" }),
    f("paid_date", "Paid Date", "date", { example: "2026-06-12" }),
    f("amount", "Amount (INR)", "number", { example: "450000" }),
    f("status", "Status", "string", { allowed: ["Paid", "Pending", "Late"], example: "Paid" }),
  ],
  ["pay_month", "statutory_type"], {}, "Payroll_statutory_YYYY-MM.xlsx",
  "Statutory remittance tracking (PF/ESI/PT/TDS/LWF) — drives on-time compliance %.",
  "aggregate",
);

// --------------------------------------------------------------- L&D
export const LD_PROGRAM = new DatasetSchema(
  "ld_program", "L&D — Programs", "L&D", "month",
  [
    f("program_id", "Program ID", "string", { required: true, example: "LDP-014" }),
    f("program_name", "Program Name", "string", { required: true, example: "Manager Essentials" }),
    f("category", "Category", "string", { allowed: ["Mandatory", "Compliance", "Functional", "Leadership", "Onboarding"], example: "Leadership" }),
    f("mode", "Mode", "string", { allowed: ["Classroom", "Virtual", "Self-paced"], example: "Virtual" }),
    f("start_date", "Start Date", "date", { example: "2026-05-05" }),
    f("end_date", "End Date", "date", { example: "2026-05-06" }),
    f("trainer_vendor", "Trainer / Vendor", "string", { example: "Internal L&D" }),
    f("total_cost", "Total Cost (INR)", "number", { example: "120000" }),
    f("planned_participants", "Planned Participants", "integer", { example: "25" }),
  ],
  ["program_id"], {}, "LD_programs_YYYY-MM.xlsx",
  "Catalogue of training programs run in the period.",
);

export const LD_ENROLLMENT = new DatasetSchema(
  "ld_enrollment", "L&D — Enrollments", "L&D", "month",
  [
    f("employee_number", "Employee Number", "string", { required: true, example: "AA0001" }),
    f("program_id", "Program ID", "string", { required: true, example: "LDP-014" }),
    f("enrolled_date", "Enrolled Date", "date", { example: "2026-05-01" }),
    f("status", "Status", "string", { allowed: ["Enrolled", "In-progress", "Completed", "Dropped"], example: "Completed" }),
    f("completion_date", "Completion Date", "date", { example: "2026-05-06" }),
    f("duration_hours", "Duration Hours", "number", { example: "8" }),
    f("assessment_score", "Assessment Score", "number", { example: "82", note: "Optional." }),
    f("feedback_score", "Feedback Score (1-5)", "number", { example: "4.5", note: "Optional." }),
  ],
  ["employee_number", "program_id"],
  { "emp no": "employee_number", "program": "program_id", "course": "program_id" },
  "LD_enrollments_YYYY-MM.xlsx",
  "One row per employee per program. Drives completion, coverage %, hours/head and compliance training status.",
);

// --------------------------------------------------------------- HR Admin / Operations
export const ADMIN_ASSET = new DatasetSchema(
  "admin_asset", "HR Admin — Assets", "HR Admin", "as_of",
  [
    f("asset_id", "Asset ID", "string", { required: true, example: "LAP-2231" }),
    f("asset_type", "Asset Type", "string", { allowed: ["Laptop", "Phone", "Access Card", "SIM", "Other"], example: "Laptop" }),
    f("assigned_employee_number", "Assigned Employee Number", "string", { example: "AA0001" }),
    f("assign_date", "Assign Date", "date", { example: "2024-01-15" }),
    f("return_date", "Return Date", "date", { example: "" }),
    f("status", "Status", "string", { allowed: ["Allocated", "Returned", "Lost", "In-stock"], example: "Allocated" }),
    f("value", "Value (INR)", "number", { example: "75000" }),
  ],
  ["asset_id"], {}, "Admin_assets_YYYY-MM.xlsx",
  "Asset allocation register. Drives utilization and offboarding asset-recovery gaps.",
);

export const ADMIN_CONTRACT = new DatasetSchema(
  "admin_contract", "HR Admin — Contracts & AMC", "HR Admin", "as_of",
  [
    f("contract_id", "Contract ID", "string", { required: true, example: "CON-0098" }),
    f("vendor_name", "Vendor Name", "string", { required: true, example: "ABC Facilities Pvt Ltd" }),
    f("category", "Category", "string", { allowed: ["Facilities", "IT", "Insurance", "License", "Other"], example: "Facilities" }),
    f("start_date", "Start Date", "date", { example: "2025-04-01" }),
    f("expiry_date", "Expiry Date", "date", { required: true, example: "2026-03-31" }),
    f("annual_cost", "Annual Cost (INR)", "number", { example: "600000" }),
    f("renewal_status", "Renewal Status", "string", { allowed: ["Auto", "In-progress", "Pending", "Cancelled"], example: "Pending" }),
    f("owner", "Owner", "string", { example: "Admin Team" }),
  ],
  ["contract_id"], {}, "Admin_contracts_YYYY-MM.xlsx",
  "Vendor/facility contracts. Drives the renewal pipeline (expiring in 30/60/90 days).",
);

export const ADMIN_LIFECYCLE = new DatasetSchema(
  "admin_lifecycle", "HR Admin — Onboarding/Offboarding", "HR Admin", "month",
  [
    f("employee_number", "Employee Number", "string", { required: true, example: "AA0123" }),
    f("type", "Type", "string", { required: true, allowed: ["Onboarding", "Offboarding"], example: "Onboarding" }),
    f("start_date", "Start Date", "date", { example: "2026-05-02" }),
    f("checklist_complete", "Checklist Complete", "boolean", { allowed: ["Y", "N"], example: "Y" }),
    f("pending_items", "Pending Items", "string", { example: "ID card" }),
    f("asset_recovered", "Asset Recovered", "boolean", { allowed: ["Y", "N"], example: "", note: "Offboarding only." }),
  ],
  ["employee_number", "type"], {}, "Admin_lifecycle_YYYY-MM.xlsx",
  "Onboarding/offboarding checklist completion and asset recovery.",
);

// --------------------------------------------------------------- Planning
export const HEADCOUNT_PLAN = new DatasetSchema(
  "headcount_plan", "Planning — Headcount Plan", "Planning", "month",
  [
    f("period", "Period", "string", { required: true, example: "2026-05" }),
    f("department", "Department", "string", { required: true, example: "Technology" }),
    f("sub_department", "Sub Department", "string", { example: "Backend Engineering" }),
    f("planned_hc", "Planned Headcount", "integer", { example: "45" }),
    f("budget_hc", "Budget Headcount", "integer", { example: "48" }),
  ],
  ["period", "department", "sub_department"], {}, "Headcount_plan_YYYY-MM.xlsx",
  "Approved headcount/budget plan. Unlocks hiring-vs-plan and cost-vs-budget variance.",
  "aggregate",
);

// --------------------------------------------------------------- registry
export const ALL_SCHEMAS: readonly DatasetSchema[] = [
  EMPLOYEE_MASTER, TA_REQUISITION, TA_AGGREGATE, PMS_REVIEW, PAYROLL_RECORD, PAYROLL_AGGREGATE,
  PAYROLL_STATUTORY, LD_PROGRAM, LD_ENROLLMENT, ADMIN_ASSET, ADMIN_CONTRACT, ADMIN_LIFECYCLE, HEADCOUNT_PLAN,
];

export const DATASET_SCHEMAS: Record<string, DatasetSchema> = Object.fromEntries(
  ALL_SCHEMAS.map((s) => [s.kind, s]),
);

export const EMPLOYEE_KIND = "employee_master";
export const GENERIC_KINDS: string[] = ALL_SCHEMAS.map((s) => s.kind).filter((k) => k !== EMPLOYEE_KIND);

export function getSchema(kind: string): DatasetSchema {
  const s = DATASET_SCHEMAS[kind];
  if (!s) throw new Error(`Unknown dataset kind: ${kind}`);
  return s;
}

export function schemasForTeam(team: string): DatasetSchema[] {
  return ALL_SCHEMAS.filter((s) => s.team === team);
}

export function allTeams(): string[] {
  const seen: string[] = [];
  for (const s of ALL_SCHEMAS) {
    if (s.kind !== EMPLOYEE_KIND && !seen.includes(s.team)) seen.push(s.team);
  }
  return seen;
}
