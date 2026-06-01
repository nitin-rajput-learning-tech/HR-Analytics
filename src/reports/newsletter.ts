// Native HR newsletter assembly — deterministic, rule-based. NO AI / LLM.
//
// Composes the employee overview + the five functional domains + the
// cross-functional cross-cut into a single Newsletter model:
//   * a CHRO executive brief (headline KPIs, wins, risks, top actions),
//   * one section per function (with "awaiting data" placeholders), and
//   * a single prioritised, owner-tagged action plan rolled up from every
//     domain's watchouts.
//
// This module builds the MODEL only (pure data); the React Reports page renders
// it to printable HTML and snapshots ChartSpecs via the charts layer. Keeping
// assembly here makes the whole newsletter testable without a DOM.

import type { DataSource } from "../core/store/types";
import { buildAll, buildCrossFunctional, DOMAIN_ORDER } from "../core/metrics";
import { buildPeople } from "../core/metrics/people";
import type { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout } from "../core/metrics/base";
import type { LeaverEvent } from "../core/metrics/cross_functional";

export interface ActionItem {
  priority: number;
  severity: "high" | "medium" | "low";
  domain: string;
  title: string;
  detail: string;
  actionHint?: string;
  owner: string;
}

export interface NewsletterSection {
  kind: string;
  anchor: string;
  label: string;
  hasData: boolean;
  blurb: string;
  kpis: MetricKPI[];
  charts: ChartSpec[];
  tables: MetricTable[];
  watchouts: MetricWatchout[];
}

export interface ExecBrief {
  headlineKpis: MetricKPI[];
  wins: string[];
  risks: string[];
  topActions: ActionItem[];
}

export interface Newsletter {
  appName: string;
  title: string;
  periodLabel: string;
  generatedAtLabel: string;
  execBrief: ExecBrief;
  sections: NewsletterSection[];
  actionPlan: ActionItem[];
  domainsWithData: number;
  domainsTotal: number;
}

export interface NewsletterOptions {
  appName?: string;
  periodLabel?: string;
  generatedAtLabel?: string; // caller supplies (core stays free of Date.now)
  activeHeadcount?: number;
  leaverEvents?: LeaverEvent[] | null;
}

const SEVERITY_RANK: Record<MetricWatchout["severity"], number> = { high: 3, medium: 2, low: 1 };

// Preferred headline KPI per section (falls back to the first KPI if absent).
const HEADLINE_PREF: Record<string, string> = {
  employee_master: "Active Headcount",
  ta_requisition: "Offer-Accept Rate",
  pms_review: "Review Completion",
  ld_enrollment: "Coverage",
  payroll_record: "Total Payroll",
  admin_asset: "Contracts ≤30d",
  cross_functional: "Compound-Risk Depts",
};

// Positive thresholds for win detection: label keyword -> minimum percentage.
const WIN_RULES: { keyword: string; min: number }[] = [
  { keyword: "Offer-Accept Rate", min: 70 },
  { keyword: "Review Completion", min: 90 },
  { keyword: "Completion Rate", min: 90 },
  { keyword: "Coverage", min: 60 },
  { keyword: "Statutory On-time", min: 98 },
  { keyword: "Calibrated", min: 90 },
];

function parsePct(value: string): number | null {
  const m = value.match(/(-?\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
}

function toSection(d: DomainMetrics): NewsletterSection {
  return {
    kind: d.kind,
    anchor: `sec-${d.kind}`,
    label: d.label,
    hasData: d.hasData,
    blurb: d.blurb,
    kpis: d.kpis,
    charts: d.charts,
    tables: d.tables,
    watchouts: d.watchouts,
  };
}

function peopleSection(store: DataSource): NewsletterSection {
  const snap = store.getLatest("employee_master");
  const base = { kind: "employee_master", anchor: "sec-employee_master", label: "People & Org" };
  if (!snap || snap.rows.length === 0) {
    return {
      ...base,
      hasData: false,
      blurb:
        "Awaiting the first employee-master upload. Publish a monthly employee workbook " +
        "from the Data Intake page to populate headcount, tenure, diversity and more.",
      kpis: [],
      charts: [],
      tables: [],
      watchouts: [],
    };
  }
  // Pull the rich People analytics and curate a detailed-but-tight summary.
  const people = buildPeople(snap.rows, snap.asOf);
  const byKind: Record<string, DomainMetrics> = Object.fromEntries(people.map((s) => [s.metrics.kind, s.metrics]));
  const ov = byKind["people_overview"];
  const ten = byKind["people_tenure"];
  const div = byKind["people_diversity"];
  const hc = byKind["people_headcount"];
  const pick = (m: DomainMetrics | undefined, label: string) => m?.kpis.find((k) => k.label === label);

  const kpis = [
    pick(ov, "Active Headcount"),
    pick(ov, "Relieved"),
    pick(ov, "Pending Exits"),
    pick(ov, "Avg Tenure (active)"),
    pick(div, "Female"),
    pick(hc, "Departments"),
  ].filter((k): k is MetricKPI => !!k);

  const charts: ChartSpec[] = [];
  if (ov?.charts[0]) charts.push(ov.charts[0]); // workforce status
  if (hc?.charts[0]) charts.push(hc.charts[0]); // headcount by department
  if (ten?.charts[0]) charts.push(ten.charts[0]); // tenure bands

  const tables: MetricTable[] = hc?.tables.slice(0, 1) ?? [];
  const watchouts: MetricWatchout[] = people.flatMap((s) => s.metrics.watchouts);

  return { ...base, hasData: true, blurb: ov?.blurb ?? "", kpis, charts, tables, watchouts };
}

function pickHeadline(section: NewsletterSection): MetricKPI | null {
  if (!section.hasData || section.kpis.length === 0) return null;
  const pref = HEADLINE_PREF[section.kind];
  if (pref) {
    const hit = section.kpis.find((k) => k.label === pref);
    if (hit) return hit;
  }
  return section.kpis[0];
}

function buildWins(sections: NewsletterSection[]): string[] {
  const scored: { text: string; score: number }[] = [];
  for (const s of sections) {
    if (!s.hasData) continue;
    for (const k of s.kpis) {
      const rule = WIN_RULES.find((r) => k.label.includes(r.keyword));
      if (!rule) continue;
      const pctVal = parsePct(k.value);
      if (pctVal !== null && pctVal >= rule.min) {
        scored.push({ text: `${s.label}: ${k.label.toLowerCase()} at ${k.value}.`, score: pctVal });
      }
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const wins = scored.slice(0, 3).map((w) => w.text);
  // Fallback: data-bearing functions with no flagged issues are themselves wins.
  if (wins.length < 3) {
    for (const s of sections) {
      if (wins.length >= 3) break;
      if (s.hasData && s.watchouts.length === 0 && s.kind !== "employee_master") {
        const line = `${s.label}: no issues flagged this period.`;
        if (!wins.includes(line)) wins.push(line);
      }
    }
  }
  return wins;
}

function buildActionPlan(sections: NewsletterSection[]): ActionItem[] {
  const items: Omit<ActionItem, "priority">[] = [];
  sections.forEach((s) => {
    for (const w of s.watchouts) {
      items.push({
        severity: w.severity,
        domain: s.label,
        title: w.title,
        detail: w.detail,
        actionHint: w.actionHint,
        owner: w.owner ?? "HR",
      });
    }
  });
  // Stable sort by severity desc; insertion order (section order) breaks ties.
  items.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  return items.map((it, i) => ({ ...it, priority: i + 1 }));
}

export function buildNewsletter(store: DataSource, opts: NewsletterOptions = {}): Newsletter {
  const appName = opts.appName ?? "HR Analytics";
  const periodLabel = opts.periodLabel ?? store.getLatest("employee_master")?.periodLabel ?? "Latest period";
  const generatedAtLabel = opts.generatedAtLabel ?? periodLabel;

  const functional = buildAll(store, { activeHeadcount: opts.activeHeadcount });
  const cross = buildCrossFunctional(store, { leaverEvents: opts.leaverEvents });

  // Order: People & Org, then the five functions (DOMAIN_ORDER), then cross-functional.
  const sections: NewsletterSection[] = [
    peopleSection(store),
    ...DOMAIN_ORDER.map((_, i) => toSection(functional[i])),
    toSection(cross),
  ];

  const actionPlan = buildActionPlan(sections);

  const headlineKpis: MetricKPI[] = [];
  for (const s of sections) {
    if (headlineKpis.length >= 5) break;
    const h = pickHeadline(s);
    if (h) headlineKpis.push({ ...h, label: `${s.label} · ${h.label}` });
  }

  const risks = actionPlan
    .filter((a) => a.severity === "high" || a.severity === "medium")
    .slice(0, 3)
    .map((a) => `${a.domain}: ${a.title} — ${a.detail}`);

  const execBrief: ExecBrief = {
    headlineKpis,
    wins: buildWins(sections),
    risks,
    topActions: actionPlan.slice(0, 5),
  };

  const domainsWithData = sections.filter((s) => s.hasData).length;

  return {
    appName,
    title: `${appName} — HR Newsletter`,
    periodLabel,
    generatedAtLabel,
    execBrief,
    sections,
    actionPlan,
    domainsWithData,
    domainsTotal: sections.length,
  };
}
