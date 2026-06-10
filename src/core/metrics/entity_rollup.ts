// BUILD-8 — multi-entity rollup. A group view across legal entities: each entity's
// headcount, tenure, departments and monthly cost side by side, plus a consolidated
// total — so a group CHRO sees the whole and the parts at once. A DomainMetrics, so
// it renders via DomainView (with legal-entity drill-down) and flows to the
// newsletter. Pure + deterministic.

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout, emptyDomain } from "./base";

const KIND = "entity_rollup";
const LABEL = "Entity Rollup";

const str = (v: unknown) => String(v ?? "").trim();
const isWorking = (r: Row) => str(r["employment_status"]) === "Working";
const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(str(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const dayMs = (v: unknown): number | null => {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
};

export interface EntityRollupInput {
  employeeRows: Row[];
  payrollAggregateRows?: Row[] | null;
  asOf?: string | null;
}

interface EntityRow {
  entity: string;
  active: number;
  relieved: number;
  total: number;
  avgTenureYrs: number | null;
  departments: number;
  cost: number | null; // monthly gross, INR
  costPerHead: number | null;
}

export function buildEntityRollup(input: EntityRollupInput): DomainMetrics {
  const rows = input.employeeRows ?? [];
  if (!rows.length || !rows.some((r) => "legal_entity" in r && str(r["legal_entity"]))) {
    return emptyDomain(KIND, LABEL, "a multi-entity group (needs a legal-entity column)");
  }
  const refMs = dayMs(input.asOf ?? null);

  // Cost by entity from the payroll aggregate (total_gross / headcount_paid).
  const grossByEntity = new Map<string, number>();
  const headsByEntity = new Map<string, number>();
  for (const r of input.payrollAggregateRows ?? []) {
    const e = str(r["legal_entity"]);
    if (!e) continue;
    grossByEntity.set(e, (grossByEntity.get(e) ?? 0) + toNum(r["total_gross"]));
    headsByEntity.set(e, (headsByEntity.get(e) ?? 0) + toNum(r["headcount_paid"]));
  }
  const havePay = grossByEntity.size > 0;

  const byEntity = new Map<string, Row[]>();
  for (const r of rows) {
    const e = str(r["legal_entity"]) || "Unspecified";
    byEntity.set(e, [...(byEntity.get(e) ?? []), r]);
  }

  const entityRows: EntityRow[] = [...byEntity.entries()]
    .map(([entity, ers]) => {
      const active = ers.filter(isWorking);
      const tenures = refMs !== null ? active.map((r) => dayMs(r["date_joined"])).filter((j): j is number => j !== null).map((j) => (refMs - j) / 86_400_000 / 365) : [];
      const cost = havePay ? grossByEntity.get(entity) ?? null : null;
      const heads = headsByEntity.get(entity) ?? 0;
      return {
        entity,
        active: active.length,
        relieved: ers.filter((r) => str(r["employment_status"]) === "Relieved").length,
        total: ers.length,
        avgTenureYrs: tenures.length ? Math.round((tenures.reduce((s, d) => s + d, 0) / tenures.length) * 10) / 10 : null,
        departments: new Set(active.map((r) => str(r["department"]) || "Unspecified")).size,
        cost,
        costPerHead: cost !== null && heads > 0 ? cost / heads : null,
      };
    })
    .sort((a, b) => b.active - a.active || a.entity.localeCompare(b.entity));

  const groupActive = entityRows.reduce((s, e) => s + e.active, 0);
  const groupCost = havePay ? entityRows.reduce((s, e) => s + (e.cost ?? 0), 0) : null;
  const largest = entityRows[0];
  const largestShare = largest && groupActive > 0 ? (largest.active / groupActive) * 100 : 0;
  const money = (n: number) => N.humanizeMoneyInr(Math.round(n));

  const kpis: MetricKPI[] = [
    { label: "Legal Entities", value: N.humanizeInt(entityRows.length) },
    { label: "Group Headcount", value: N.humanizeInt(groupActive), hint: "active across all entities" },
    { label: "Largest Entity", value: largest ? `${N.formatPct(largestShare)}` : "—", hint: largest ? largest.entity : undefined },
    ...(groupCost !== null ? [{ label: "Group Monthly Cost", value: money(groupCost), hint: "sum of entity payroll" }] : []),
  ];

  const charts: ChartSpec[] = [
    { title: "Headcount by entity", caption: "Active staff per legal entity.", kind: "barh", labels: entityRows.map((e) => e.entity), values: entityRows.map((e) => e.active), drill: "legal_entity" },
  ];

  const columns = ["Legal entity", "Active", "Relieved", "Avg Tenure (yrs)", "Departments"];
  if (havePay) columns.push("Monthly cost", "Cost / head");
  const tables: MetricTable[] = [
    {
      title: "Entity rollup",
      caption: "Each legal entity side by side. Click a row to open People Analytics filtered to that entity.",
      columns,
      rows: entityRows.map((e) => {
        const row: (string | number)[] = [e.entity, e.active, e.relieved, e.avgTenureYrs ?? "—", e.departments];
        if (havePay) row.push(e.cost === null ? "—" : money(e.cost), e.costPerHead === null ? "—" : money(e.costPerHead));
        return row;
      }),
      drill: "legal_entity",
    },
  ];

  const watchouts: MetricWatchout[] = [];
  if (entityRows.length >= 2 && largestShare >= 70) {
    watchouts.push({
      severity: largestShare >= 85 ? "high" : "medium",
      title: "Headcount concentrated in one entity",
      detail: `${largest.entity} holds ${N.formatPct(largestShare)} of group active headcount — concentration risk for a multi-entity group.`,
      actionHint: "Confirm this matches the intended legal/operating structure; concentration affects compliance, tax and continuity planning.",
      owner: "HR Leadership",
    });
  }

  return {
    kind: KIND,
    label: LABEL,
    hasData: true,
    blurb: `${entityRows.length} legal entit${entityRows.length === 1 ? "y" : "ies"} · ${N.humanizeInt(groupActive)} active group-wide${groupCost !== null ? ` · ${money(groupCost)}/mo` : ""}. Largest: ${largest?.entity} (${N.formatPct(largestShare)}).`,
    kpis,
    charts,
    tables,
    watchouts,
  };
}
