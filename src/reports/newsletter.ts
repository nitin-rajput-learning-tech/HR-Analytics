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
import { buildDomainCompared, buildCrossFunctional, DOMAIN_ORDER } from "../core/metrics";
import { buildPeople } from "../core/metrics/people";
import { combinedEmployeeSnapshot, employeePeriods } from "../core/metrics/combineEmployees";
import { buildBrain, periodDigest, type BrainFinding, type BrainHealth, type RoadmapItem } from "../core/brain/brain";
import { type MaturityResult } from "../core/brain/maturity";
import { actionSummary, type Action, type ActionSummary } from "../core/actions";
import { decoratePeopleDeltas, prettyPeriod } from "../core/metrics/compare";
import { joinClauses } from "../core/narrative";
import { buildRisk } from "../core/metrics/risk";
import { buildPayEquity } from "../core/metrics/pay_equity";
import { buildScorecard, type ScorecardRow } from "../core/scorecard";
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

export interface Mover {
  text: string;
  tone: "good" | "bad";
}

export interface ExecBrief {
  summary: string;
  headlineKpis: MetricKPI[];
  movers: Mover[];
  wins: string[];
  risks: string[];
  topActions: ActionItem[];
}

// UP-8 — a consolidated "what changed since last period" diff: the comparison
// newsletter's headline. null when there's no prior period to compare to.
export interface NewsletterComparison {
  priorLabel: string;
  healthScore: number;
  healthPrior: number | null;
  healthDelta: number | null;
  healthTrend: string | null;
  newFindings: string[]; // issues that emerged this period
  resolvedFindings: string[]; // issues cleared since last period
  improved: { label: string; trend: string }[]; // KPIs moving the right way
  declined: { label: string; trend: string }[]; // KPIs moving the wrong way
  atRisk: string[]; // on-target KPIs trending toward their threshold (UP-4)
}

export interface Newsletter {
  appName: string;
  title: string;
  periodLabel: string;
  generatedAtLabel: string;
  execBrief: ExecBrief;
  brain: { health: BrainHealth; findings: BrainFinding[]; roadmap: RoadmapItem[]; maturity: MaturityResult; resolved: { id: string; title: string }[]; periodDigest: string | null };
  comparison: NewsletterComparison | null;
  scorecard: ScorecardRow[];
  sections: NewsletterSection[];
  actionPlan: ActionItem[];
  // Tracked commitments (from the action loop) — distinct from the watch-out
  // action plan; shows follow-through (committed vs done) in the board pack.
  trackedActions: { summary: ActionSummary; items: Action[] };
  domainsWithData: number;
  domainsTotal: number;
}

export interface NewsletterOptions {
  appName?: string;
  periodLabel?: string;
  generatedAtLabel?: string; // caller supplies (core stays free of Date.now)
  activeHeadcount?: number;
  leaverEvents?: LeaverEvent[] | null;
  targets?: Record<string, number>;
  benchmarks?: Record<string, { low: number; high: number }>;
  actions?: Action[]; // tracked commitments, surfaced in the board pack
}

const SEVERITY_RANK: Record<MetricWatchout["severity"], number> = { high: 3, medium: 2, low: 1 };

// Preferred headline KPI per section (falls back to the first KPI if absent).
const HEADLINE_PREF: Record<string, string> = {
  employee_master: "Active Headcount",
  people_risk: "High Risk",
  people_pay_equity: "Gender Pay Gap",
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
  const snap = combinedEmployeeSnapshot(store);
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
  // Month-over-month deltas vs the prior employee snapshot (same pattern as the
  // People page), so headcount/attrition movement surfaces in the brief.
  const empSnaps = employeePeriods(store);
  const priorSnap = empSnaps.length >= 2 ? empSnaps[empSnaps.length - 2] : null;
  const priorPeople = priorSnap ? buildPeople(priorSnap.rows, priorSnap.asOf) : null;
  const decorated = decoratePeopleDeltas(people, priorPeople, priorSnap ? prettyPeriod(priorSnap.periodLabel ?? priorSnap.asOf) : "");
  const byKind: Record<string, DomainMetrics> = Object.fromEntries(decorated.map((s) => [s.metrics.kind, s.metrics]));
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

// Turn a KPI delta chip ("▲ +4 vs Apr 2026") into prose ("up 4 since Apr 2026").
function deltaToProse(delta: string | null | undefined): string | null {
  if (!delta || delta.startsWith("no change")) return null;
  const body = delta.replace(/^[▲▼]\s*/, "");
  const [magPart, period] = body.split(" vs ");
  if (!magPart) return null;
  const dir = magPart.trim().startsWith("+") ? "up" : "down";
  const mag = magPart.trim().replace(/^[+−-]/, "");
  return period ? `${dir} ${mag} since ${period.trim()}` : `${dir} ${mag}`;
}

// A one-paragraph CHRO lede that synthesises the period: scale + trend + coverage,
// then a crisp wins/risks summary. Pure prose from the already-computed pieces.
function buildExecSummary(opts: {
  appName: string;
  periodLabel: string;
  headcount?: MetricKPI;
  domainsWithData: number;
  domainsTotal: number;
  winsCount: number;
  risksCount: number;
  topRiskDomain?: string;
}): string {
  const { appName, periodLabel, headcount, domainsWithData, domainsTotal, winsCount, risksCount, topRiskDomain } = opts;
  const period = prettyPeriod(periodLabel);
  const out: string[] = [];

  if (headcount) {
    let s = `As of ${period}, ${appName}'s workforce stands at ${headcount.value} active employees`;
    if (headcount.hint) s += ` (${headcount.hint})`;
    const trend = deltaToProse(headcount.delta);
    if (trend) s += `, ${trend}`;
    s += `, with ${domainsWithData} of ${domainsTotal} HR functions reporting.`;
    out.push(s);
  } else if (domainsWithData > 0) {
    out.push(`${domainsWithData} of ${domainsTotal} HR functions are reporting for ${period}.`);
  }

  const clauses: string[] = [];
  if (winsCount > 0) clauses.push(`${winsCount} ${winsCount === 1 ? "area is" : "areas are"} performing strongly`);
  if (risksCount > 0) clauses.push(`${risksCount} ${risksCount === 1 ? "risk needs" : "risks need"} attention${topRiskDomain ? `, led by ${topRiskDomain}` : ""}`);
  if (clauses.length) {
    const joined = joinClauses(clauses);
    out.push(joined.charAt(0).toUpperCase() + joined.slice(1) + ".");
  }
  return out.join(" ");
}

// Notable month-over-month movers for the exec brief — KPI cards that carry a
// toned delta (set by the period-comparison decorators). Deteriorations lead
// (they need attention), then improvements; capped so the brief stays tight.
function buildMovers(sections: NewsletterSection[]): Mover[] {
  const movers: Mover[] = [];
  for (const s of sections) {
    if (!s.hasData) continue;
    for (const k of s.kpis) {
      if (!k.delta || !k.deltaTone || k.deltaTone === "neutral") continue;
      if (k.delta.startsWith("no change")) continue;
      movers.push({ text: `${s.label} — ${k.label} ${k.value} · ${k.delta}`, tone: k.deltaTone });
    }
  }
  const bad = movers.filter((m) => m.tone === "bad");
  const good = movers.filter((m) => m.tone === "good");
  return [...bad, ...good].slice(0, 6);
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
  const periodLabel = opts.periodLabel ?? combinedEmployeeSnapshot(store)?.periodLabel ?? "Latest period";
  const generatedAtLabel = opts.generatedAtLabel ?? periodLabel;

  const functional = DOMAIN_ORDER.map((k) => buildDomainCompared(store, k, { activeHeadcount: opts.activeHeadcount }));
  const cross = buildCrossFunctional(store, { leaverEvents: opts.leaverEvents });
  const scorecard = buildScorecard(store, opts.targets ?? {}, opts.benchmarks ?? {});

  // People-page differentiators that belong in the board brief: their watch-outs
  // (flight risk, gender pay gap) flow into the action plan + exec-brief risks
  // because every section's watchouts are rolled up. Built from the latest
  // snapshots; both degrade to placeholders when their inputs are absent.
  const snap = combinedEmployeeSnapshot(store);
  const empRows = snap?.rows ?? [];
  const payrollRows = store.getLatest("payroll_record")?.rows ?? null;
  const pmsRows = store.getLatest("pms_review")?.rows ?? null;
  const risk = buildRisk({ employeeRows: empRows, asOf: snap?.asOf ?? null, payrollRows, pmsRows });
  const payEquity = buildPayEquity({ employeeRows: empRows, payrollRows });

  // Order: People & Org, attrition risk, pay equity, the functions (DOMAIN_ORDER),
  // then the cross-functional cross-cut.
  const sections: NewsletterSection[] = [
    peopleSection(store),
    toSection(risk),
    toSection(payEquity),
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

  const topRisk = actionPlan.find((a) => a.severity === "high" || a.severity === "medium");
  const risks = actionPlan
    .filter((a) => a.severity === "high" || a.severity === "medium")
    .slice(0, 3)
    .map((a) => `${a.domain}: ${a.title} — ${a.detail}`);

  const wins = buildWins(sections);
  const domainsWithData = sections.filter((s) => s.hasData).length;
  const headcountKpi = sections[0]?.kpis.find((k) => k.label === "Active Headcount");

  const execBrief: ExecBrief = {
    summary: buildExecSummary({
      appName,
      periodLabel,
      headcount: headcountKpi,
      domainsWithData,
      domainsTotal: sections.length,
      winsCount: wins.length,
      risksCount: risks.length,
      topRiskDomain: topRisk?.domain,
    }),
    headlineKpis,
    movers: buildMovers(sections),
    wins,
    risks,
    topActions: actionPlan.slice(0, 5),
  };

  const brain = buildBrain(store, { targets: opts.targets ?? {}, benchmarks: opts.benchmarks ?? {} });

  // UP-8 comparison diff — consolidate the period-over-period signals already
  // computed (health delta, new/resolved findings, scorecard trends) into one
  // "what changed" block. Null when there's no prior period (no health.priorLabel).
  const comparison: NewsletterComparison | null = brain.health.priorLabel
    ? {
        priorLabel: brain.health.priorLabel,
        healthScore: brain.health.score,
        healthPrior: brain.health.prior,
        healthDelta: brain.health.delta,
        healthTrend: brain.health.trend,
        newFindings: brain.findings.filter((f) => f.isNew).map((f) => f.title),
        resolvedFindings: brain.resolved.map((r) => r.title),
        improved: scorecard.filter((r) => r.trendTone === "good" && r.trend).map((r) => ({ label: r.label, trend: r.trend })),
        declined: scorecard.filter((r) => r.trendTone === "bad" && r.trend).map((r) => ({ label: r.label, trend: r.trend })),
        atRisk: scorecard.filter((r) => r.track === "at_risk").map((r) => r.label),
      }
    : null;

  return {
    appName,
    title: `${appName} — HR Newsletter`,
    periodLabel,
    generatedAtLabel,
    execBrief,
    brain: { health: brain.health, findings: brain.findings.slice(0, 6), roadmap: brain.roadmap, maturity: brain.maturity, resolved: brain.resolved, periodDigest: periodDigest(brain) },
    comparison,
    scorecard,
    sections,
    actionPlan,
    trackedActions: { summary: actionSummary(opts.actions ?? [], snap?.asOf ?? ""), items: opts.actions ?? [] },
    domainsWithData,
    domainsTotal: sections.length,
  };
}
