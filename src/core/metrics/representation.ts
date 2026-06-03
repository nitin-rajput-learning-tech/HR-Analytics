// Representation (DEI) deep-dive — the questions a single headline gender % can't
// answer: are women represented in LEADERSHIP, across SENIORITY, and is the
// org's representation improving or eroding (hires vs leavers)? Complements the
// basic Diversity tab (overall mix + by department). Pure + testable; degrades
// to a clear placeholder when gender data is absent.

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout } from "./base";

const KIND = "people_representation";
const LABEL = "Representation";

const str = (v: unknown) => String(v ?? "").trim();
const isWorking = (r: Row) => str(r["employment_status"]) === "Working";
const isRelieved = (r: Row) => str(r["employment_status"]) === "Relieved";
const dayMs = (v: unknown): number | null => {
  const t = Date.parse(str(v));
  return Number.isNaN(t) ? null : t;
};
const TENURE_ORDER = ["<6 months", "6-12 months", "1-2 years", "2-5 years", "5+ years"];
function tenureBand(days: number | null): string | null {
  if (days === null || days < 0) return null;
  if (days < 180) return "<6 months";
  if (days < 365) return "6-12 months";
  if (days < 730) return "1-2 years";
  if (days < 1825) return "2-5 years";
  return "5+ years";
}
const gender = (r: Row) => str(r["gender"]).toLowerCase();
const isFemale = (r: Row) => gender(r) === "female";
const hasKnownGender = (r: Row) => gender(r) === "female" || gender(r) === "male";
// Female share (%) among rows with a known (female/male) gender; null if none.
function femaleShare(rows: Row[]): number | null {
  const known = rows.filter(hasKnownGender);
  return known.length ? (known.filter(isFemale).length / known.length) * 100 : null;
}

export interface RepresentationInput {
  employeeRows: Row[];
  asOf?: string | null;
}

export function buildRepresentation(input: RepresentationInput): DomainMetrics {
  const empty = (msg: string): DomainMetrics => ({ kind: KIND, label: LABEL, hasData: false, blurb: msg, kpis: [], charts: [], tables: [], watchouts: [] });
  const rows = input.employeeRows;
  const active = rows.filter(isWorking);
  if (!active.length || !active.some((r) => "gender" in r)) return empty("Gender data not available in this upload — add a gender column to unlock representation analytics.");

  const refMs = dayMs(input.asOf ?? null);
  const overall = femaleShare(active);

  // --- Leadership: gender mix among people-managers (matched by name) ---------
  const nameToGender = new Map<string, string>();
  for (const r of active) { const nm = str(r["full_name"]).toLowerCase(); if (nm) nameToGender.set(nm, gender(r)); }
  const managerNames = [...new Set(active.map((r) => str(r["reporting_manager"])).filter(Boolean))];
  const matchedMgrGenders = managerNames.map((m) => nameToGender.get(m.toLowerCase())).filter((g): g is string => g === "female" || g === "male");
  const leadShare = matchedMgrGenders.length ? (matchedMgrGenders.filter((g) => g === "female").length / matchedMgrGenders.length) * 100 : null;

  // --- Seniority: female share by tenure band ---------------------------------
  const bandAgg = new Map<string, { f: number; k: number }>();
  for (const r of active) {
    if (!hasKnownGender(r)) continue;
    const j = dayMs(r["date_joined"]);
    const b = refMs !== null && j !== null ? tenureBand(Math.floor((refMs - j) / 86_400_000)) : null;
    if (!b) continue;
    const a = bandAgg.get(b) ?? { f: 0, k: 0 };
    a.k += 1;
    if (isFemale(r)) a.f += 1;
    bandAgg.set(b, a);
  }
  const bandShare = TENURE_ORDER.map((b) => ({ band: b, share: bandAgg.get(b)?.k ? ((bandAgg.get(b)!.f / bandAgg.get(b)!.k) * 100) : 0, n: bandAgg.get(b)?.k ?? 0 }));

  // --- Pipeline: hires (last 12mo) vs leavers ---------------------------------
  const joiners = refMs === null ? [] : active.filter((r) => { const j = dayMs(r["date_joined"]); return j !== null && refMs - j >= 0 && refMs - j <= 365 * 86_400_000; });
  const leavers = rows.filter(isRelieved);
  const joinerShare = joiners.length ? femaleShare(joiners) : null;
  const leaverShare = leavers.length ? femaleShare(leavers) : null;

  const pct1 = (v: number | null) => (v === null ? "n/a" : N.formatPct(v));
  const gap = overall !== null && leadShare !== null ? overall - leadShare : null;
  const kpis: MetricKPI[] = [
    { label: "Female (overall)", value: pct1(overall), hint: `${active.filter(isFemale).length} of ${active.filter(hasKnownGender).length}` },
    { label: "Leadership Female", value: pct1(leadShare), hint: gap !== null ? `${gap >= 0 ? "−" : "+"}${Math.abs(Math.round(gap * 10) / 10)}pp vs overall` : `${matchedMgrGenders.length} managers matched` },
    { label: "New-Hire Female", value: pct1(joinerShare), hint: "joined in last 12 months" },
    { label: "Exiting Female", value: pct1(leaverShare), hint: `${leavers.length} leaver(s)` },
  ];

  const charts: ChartSpec[] = [];
  if (bandShare.some((b) => b.n > 0)) {
    charts.push({ title: "Female share by tenure", caption: "Representation across seniority (active staff). Rising-to-the-right = junior-skewed.", kind: "bar", labels: TENURE_ORDER, values: bandShare.map((b) => Math.round(b.share * 10) / 10) });
  }
  const pipeLabels = ["Overall"];
  const pipeValues = [Math.round((overall ?? 0) * 10) / 10];
  if (joinerShare !== null) { pipeLabels.push("New hires"); pipeValues.push(Math.round(joinerShare * 10) / 10); }
  if (leaverShare !== null) { pipeLabels.push("Leavers"); pipeValues.push(Math.round(leaverShare * 10) / 10); }
  if (pipeLabels.length > 1) {
    charts.push({ title: "Diversity pipeline — female %", caption: "If leavers skew more female than new hires, representation is eroding.", kind: "bar", labels: pipeLabels, values: pipeValues });
  }

  const tables: MetricTable[] = [
    {
      title: "Female representation by segment",
      caption: "Share of women within each population (known-gender basis).",
      columns: ["Segment", "Female %", "Basis"],
      rows: [
        ["Overall (active)", pct1(overall), `${active.filter(hasKnownGender).length} staff`],
        ["Leadership (managers)", pct1(leadShare), `${matchedMgrGenders.length} matched`],
        ["New hires (12 mo)", pct1(joinerShare), `${joiners.length} joiners`],
        ["Leavers", pct1(leaverShare), `${leavers.length} exits`],
      ] as (string | number)[][],
    },
  ];

  const watchouts: MetricWatchout[] = [];
  if (gap !== null && gap >= 10) {
    watchouts.push({
      severity: gap >= 20 ? "high" : "medium",
      title: "Women under-represented in leadership",
      detail: `Female share among people-managers is ${pct1(leadShare)} vs ${pct1(overall)} overall — a ${Math.round(gap * 10) / 10}pp leadership gap.`,
      actionHint: "Review promotion + succession slates for balance; sponsor high-potential women into manager roles.",
      owner: "HR Leadership",
    });
  }
  if (joinerShare !== null && leaverShare !== null && leaverShare - joinerShare >= 10) {
    watchouts.push({
      severity: "medium",
      title: "Representation eroding through the pipeline",
      detail: `Leavers are ${pct1(leaverShare)} female but new hires only ${pct1(joinerShare)} — the org is losing women faster than it is hiring them.`,
      actionHint: "Check hiring-slate diversity and run a retention review for under-represented groups.",
      owner: "HR Leadership",
    });
  }

  const blurbGap = gap !== null && gap >= 5 ? ` Leadership trails overall by ${Math.round(gap * 10) / 10}pp.` : "";
  return {
    kind: KIND,
    label: LABEL,
    hasData: true,
    blurb: `Female representation ${pct1(overall)} overall, ${pct1(leadShare)} in leadership.${blurbGap}`,
    kpis,
    charts,
    tables,
    watchouts,
  };
}
