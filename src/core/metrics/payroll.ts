// Payroll metrics — cost, cost/head, variable & overtime mix, statutory on-time.
// Spans payroll_record (detail), payroll_aggregate, payroll_statutory.

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout, emptyDomain } from "./base";

const LABEL = "Payroll & Cost";
const TEAM = "Payroll";

function sumCol(rows: Row[], col: string): number {
  let t = 0;
  for (const r of rows) {
    const n = typeof r[col] === "number" ? (r[col] as number) : Number(r[col]);
    if (Number.isFinite(n)) t += n;
  }
  return t;
}
const nonEmpty = (rows?: Row[] | null): rows is Row[] => !!rows && rows.length > 0;

export interface PayrollInput {
  recordRows?: Row[] | null;
  aggregateRows?: Row[] | null;
  statutoryRows?: Row[] | null;
  asOf?: string | null;
}

export function compute(input: PayrollInput): DomainMetrics {
  const { recordRows, aggregateRows, statutoryRows } = input;
  const hasRecord = nonEmpty(recordRows);
  const hasAgg = nonEmpty(aggregateRows);
  const hasStat = nonEmpty(statutoryRows);
  if (!hasRecord && !hasAgg && !hasStat) return emptyDomain("payroll_record", LABEL, TEAM);

  const kpis: MetricKPI[] = [];
  const charts: ChartSpec[] = [];
  const tables: MetricTable[] = [];
  const watchouts: MetricWatchout[] = [];
  const blurbParts: string[] = [];

  let totalGross = 0;
  let headcount = 0;
  let variable = 0;
  let overtime = 0;
  let errors = 0;

  if (hasAgg) {
    totalGross = sumCol(aggregateRows!, "total_gross");
    headcount = sumCol(aggregateRows!, "headcount_paid");
    variable = sumCol(aggregateRows!, "total_variable");
    overtime = sumCol(aggregateRows!, "total_overtime");
    errors = sumCol(aggregateRows!, "error_count");
    const byDept = new Map<string, number>();
    for (const r of aggregateRows!) {
      const d = String(r["department"] ?? "Unspecified");
      byDept.set(d, (byDept.get(d) ?? 0) + (Number(r["total_gross"]) || 0));
    }
    const sorted = [...byDept.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
    if (sorted.length) {
      charts.push({
        title: "Payroll cost by department",
        caption: "Gross payroll, top 12 departments.",
        kind: "barh",
        labels: sorted.map((e) => e[0]),
        values: sorted.map((e) => e[1]),
        drill: "department",
      });
    }
  } else if (hasRecord) {
    totalGross = sumCol(recordRows!, "gross_monthly");
    headcount = recordRows!.length;
    variable = sumCol(recordRows!, "variable_pay_paid");
    overtime = sumCol(recordRows!, "overtime_amount");
    errors = recordRows!.filter((r) => String(r["payroll_status"] ?? "").toLowerCase() === "error").length;
  }

  if (hasRecord || hasAgg) {
    const costHead = headcount ? totalGross / headcount : null;
    kpis.push(
      { label: "Total Payroll", value: N.humanizeMoneyInr(totalGross) },
      { label: "Headcount Paid", value: N.humanizeInt(headcount) },
      { label: "Cost / Head", value: costHead ? N.humanizeMoneyInr(costHead) : "n/a" },
      { label: "Variable % of Pay", value: N.formatPct(N.pct(variable, totalGross)) },
    );
    if (overtime) kpis.push({ label: "Overtime % of Pay", value: N.formatPct(N.pct(overtime, totalGross)) });
    kpis.push({ label: "Payroll Errors", value: N.humanizeInt(errors) });
    blurbParts.push(
      `total payroll ${N.humanizeMoneyInr(totalGross)} across ${Math.round(headcount).toLocaleString("en-US")} paid` +
        (costHead ? ` at ${N.humanizeMoneyInr(costHead)}/head` : ""),
    );
    if (errors) {
      watchouts.push({
        severity: "medium",
        title: "Payroll errors recorded",
        detail: `${errors} payroll error(s) flagged this period.`,
        actionHint: "Root-cause and correct before the next run; track recurrence.",
        owner: "Payroll",
      });
    }
  }

  if (hasStat && statutoryRows!.some((r) => "status" in r)) {
    const lc = (r: Row) => String(r["status"] ?? "").toLowerCase();
    const totalFilings = statutoryRows!.length;
    const paid = statutoryRows!.filter((r) => lc(r) === "paid").length;
    const late = statutoryRows!.filter((r) => lc(r) === "late").length;
    const pending = statutoryRows!.filter((r) => lc(r) === "pending").length;
    const onTime = N.pct(paid, totalFilings);
    kpis.push({ label: "Statutory On-time", value: N.formatPct(onTime), hint: `${paid}/${totalFilings} filings` });
    blurbParts.push(`statutory compliance ${N.formatPct(onTime)}`);
    charts.push({
      title: "Statutory filings",
      caption: "PF/ESI/PT/TDS remittance status.",
      kind: "pie",
      labels: ["Paid", "Late", "Pending"],
      values: [paid, late, pending],
    });
    if (late || pending) {
      watchouts.push({
        severity: late ? "high" : "medium",
        title: "Statutory remittances not all on time",
        detail: `${late} late and ${pending} pending statutory filing(s) this period.`,
        actionHint: "Escalate to finance — late PF/ESI/TDS carries interest and penalties.",
        owner: "Payroll",
      });
    }
  }

  if (!kpis.length) return emptyDomain("payroll_record", LABEL, TEAM);

  return {
    kind: "payroll_record",
    label: LABEL,
    hasData: true,
    blurb: N.joinClauses(blurbParts) + ".",
    kpis,
    charts,
    tables,
    watchouts,
  };
}
