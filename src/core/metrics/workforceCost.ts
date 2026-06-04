// Workforce Cost — the spend lens on payroll: total run-rate, cost per head, the
// fixed/variable split and where the money sits by department. Distinct from
// Compensation (which is about pay *levels* and equity); this is about aggregate
// *cost* and concentration. Joins payroll to the employee master by
// employee_number for department (payroll records carry no department), and is
// filter-aware — only employees in the passed-in set are costed. Pure + testable.

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout } from "./base";

const KIND = "people_workforce_cost";
const LABEL = "Workforce Cost";
const str = (v: unknown) => String(v ?? "").trim();
const num = (v: unknown) => {
  const n = Number(str(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
// Monthly gross for a payroll row, tolerant of which columns a team supplied.
const grossOf = (r: Row) => num(r["gross_monthly"]) || (num(r["ctc_annual"]) ? num(r["ctc_annual"]) / 12 : 0) || num(r["net_pay"]) + num(r["total_deductions"]);

export function buildWorkforceCost({ payrollRows, employeeRows }: { payrollRows: Row[] | null; employeeRows: Row[] }): DomainMetrics {
  const empty = (msg: string): DomainMetrics => ({ kind: KIND, label: LABEL, hasData: false, blurb: msg, kpis: [], charts: [], tables: [], watchouts: [] });

  const deptById = new Map<string, string>();
  for (const e of employeeRows) { const id = str(e["employee_number"]); if (id) deptById.set(id, str(e["department"]) || "Unspecified"); }

  const pay = (payrollRows ?? []).filter((r) => grossOf(r) > 0 && deptById.has(str(r["employee_number"])));
  if (!pay.length) return empty("Workforce cost needs payroll data joined to the employee master — upload the Payroll workbook (gross_monthly or ctc_annual).");

  const money = (n: number) => N.humanizeMoneyInr(Math.round(n));
  const totalMonthly = pay.reduce((s, r) => s + grossOf(r), 0);
  const headcount = pay.length;
  const costPerHead = totalMonthly / headcount;
  const annualRunRate = pay.reduce((s, r) => s + (num(r["ctc_annual"]) || grossOf(r) * 12), 0);
  const variableTotal = pay.reduce((s, r) => s + num(r["variable_pay_paid"]), 0);
  const variableShare = N.pct(variableTotal, totalMonthly);
  const overtimeTotal = pay.reduce((s, r) => s + num(r["overtime_amount"]), 0);

  const byDept = new Map<string, { cost: number; n: number }>();
  for (const r of pay) {
    const d = deptById.get(str(r["employee_number"])) || "Unspecified";
    const cur = byDept.get(d) ?? { cost: 0, n: 0 };
    cur.cost += grossOf(r);
    cur.n += 1;
    byDept.set(d, cur);
  }
  const deptRows = [...byDept.entries()].map(([dept, v]) => ({ dept, cost: v.cost, n: v.n, share: v.cost / totalMonthly })).sort((a, b) => b.cost - a.cost);

  const kpis: MetricKPI[] = [
    { label: "Monthly Cost", value: money(totalMonthly), hint: `${headcount} on payroll` },
    { label: "Cost per Head", value: money(costPerHead), hint: "monthly gross" },
    { label: "Annual Run-rate", value: money(annualRunRate), hint: "annualised payroll" },
    { label: "Variable Pay Share", value: N.formatPct(variableShare), hint: "of monthly gross" },
  ];
  if (overtimeTotal > 0) kpis.push({ label: "Overtime Cost", value: money(overtimeTotal), hint: "this month" });

  const top = deptRows.slice(0, 10);
  const charts: ChartSpec[] = [
    { title: "Monthly cost by department", caption: "Total monthly gross by department (top 10).", kind: "bar", labels: top.map((d) => d.dept), values: top.map((d) => Math.round(d.cost)) },
  ];

  const tables: MetricTable[] = [
    {
      title: "Cost by department",
      caption: "Monthly gross, headcount and cost-per-head by department.",
      columns: ["Department", "Headcount", "Monthly Cost", "Cost/Head", "% of Total"],
      rows: deptRows.map((d) => [d.dept, d.n, money(d.cost), money(d.cost / d.n), N.formatPct(d.share * 100)] as (string | number)[]),
    },
  ];

  const watchouts: MetricWatchout[] = [];
  const lead = deptRows[0];
  if (lead && lead.share > 0.4 && deptRows.length >= 3) {
    watchouts.push({ severity: lead.share > 0.55 ? "high" : "medium", title: "Cost concentration", detail: `${lead.dept} accounts for ${N.formatPct(lead.share * 100)} of monthly workforce cost — spend is concentrated in one team.`, actionHint: "Confirm the concentration matches headcount and strategic priority; watch single-team budget risk.", owner: "Finance / HR" });
  }
  const notPaid = pay.filter((r) => str(r["payroll_status"]) && str(r["payroll_status"]) !== "Paid").length;
  if (notPaid >= 3) {
    watchouts.push({ severity: "medium", title: `${notPaid} payments not in “Paid” status`, detail: `${notPaid} payroll records are Held or in Error this month — unresolved pay items carry cost-accuracy and compliance risk.`, actionHint: "Clear held/error payments before the next cycle.", owner: "Payroll" });
  }

  return {
    kind: KIND,
    label: LABEL,
    hasData: true,
    blurb: `Monthly workforce cost ${money(totalMonthly)} across ${headcount} on payroll (${money(costPerHead)}/head); annual run-rate ${money(annualRunRate)}.`,
    kpis,
    charts,
    tables,
    watchouts,
  };
}
