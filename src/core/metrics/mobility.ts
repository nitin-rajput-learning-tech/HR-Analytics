// Internal Mobility & Promotions — career movement *within* the org, distinct
// from the Movement tab (which tracks joiners/leavers headcount flow). Diffs the
// two latest employee snapshots among continuing staff to surface department,
// sub-department, role (job_title) and reporting-line changes, and reads the
// promotion-recommended signal from PMS. Pure + testable; degrades when there's
// only one snapshot (shows the promotion pipeline) or no data at all.

import * as N from "../narrative";
import type { Row } from "../ingest/types";
import { ChartSpec, DomainMetrics, MetricKPI, MetricTable, MetricWatchout } from "./base";

const KIND = "people_mobility";
const LABEL = "Mobility";
const str = (v: unknown) => String(v ?? "").trim();

interface MobilitySnap {
  rows: Row[];
}

export function buildMobility({ employeeSnaps, pmsRows }: { employeeSnaps: MobilitySnap[]; pmsRows: Row[] | null }): DomainMetrics {
  const empty = (msg: string): DomainMetrics => ({ kind: KIND, label: LABEL, hasData: false, blurb: msg, kpis: [], charts: [], tables: [], watchouts: [] });

  const latest = employeeSnaps.length ? employeeSnaps[employeeSnaps.length - 1] : null;
  const prior = employeeSnaps.length >= 2 ? employeeSnaps[employeeSnaps.length - 2] : null;
  const hasMoves = !!(prior && latest);

  const moves: { name: string; type: string; from: string; to: string }[] = [];
  const moverIds = new Set<string>();
  let stayers = 0;
  if (prior && latest) {
    const priorBy = new Map<string, Row>();
    for (const r of prior.rows) { const id = str(r["employee_number"]); if (id) priorBy.set(id, r); }
    const FIELDS: [string, string][] = [["department", "Department"], ["sub_department", "Sub-dept"], ["job_title", "Role"], ["reporting_manager", "Manager"]];
    for (const r of latest.rows) {
      if (str(r["employment_status"]) !== "Working") continue;
      const id = str(r["employee_number"]);
      const before = id ? priorBy.get(id) : undefined;
      if (!before || str(before["employment_status"]) !== "Working") continue;
      stayers += 1;
      for (const [f, label] of FIELDS) {
        const a = str(before[f]);
        const b = str(r[f]);
        if (a && b && a !== b) { moves.push({ name: str(r["full_name"]) || id, type: label, from: a, to: b }); moverIds.add(id); }
      }
    }
  }
  const byType = (t: string) => moves.filter((m) => m.type === t).length;
  const moverRate = N.pct(moverIds.size, stayers);

  // Forward-looking promotion pipeline from PMS.
  const pms = pmsRows ?? [];
  const promoEligible = pms.filter((r) => "promotion_recommended" in r);
  const promoRec = promoEligible.filter((r) => /^y/i.test(str(r["promotion_recommended"]))).length;
  const hasPromo = promoEligible.length > 0;

  if (!hasMoves && !hasPromo) {
    return empty("Internal mobility needs at least two employee snapshots (to detect moves) or PMS promotion data — upload another month or the PMS workbook.");
  }

  const kpis: MetricKPI[] = [];
  if (hasMoves) {
    kpis.push({ label: "Internal Moves", value: N.humanizeInt(moverIds.size), hint: `${N.formatPct(moverRate)} of continuing staff` });
    kpis.push({ label: "Department Moves", value: N.humanizeInt(byType("Department")), hint: "cross-functional transfers" });
    kpis.push({ label: "Role Changes", value: N.humanizeInt(byType("Role")), hint: "new job title" });
  }
  if (hasPromo) {
    kpis.push({ label: "Promotions Recommended", value: N.humanizeInt(promoRec), hint: `${N.formatPct(N.pct(promoRec, promoEligible.length))} of reviewed` });
  }

  const charts: ChartSpec[] = [];
  if (moves.length) {
    const labels = ["Department", "Sub-dept", "Role", "Manager"];
    charts.push({ title: "Moves by type", caption: "Internal changes since the prior snapshot, by what changed.", kind: "bar", labels, values: labels.map(byType) });
  }

  const tables: MetricTable[] = [];
  if (moves.length) {
    tables.push({
      title: "Internal moves",
      caption: "Continuing employees whose department, role or reporting line changed since the prior snapshot.",
      columns: ["Employee", "Change", "From", "To"],
      rows: moves.slice(0, 20).map((m) => [m.name, m.type, m.from, m.to] as (string | number)[]),
    });
  }

  const watchouts: MetricWatchout[] = [];
  if (hasMoves && stayers >= 20 && moverRate !== null && moverRate < 3) {
    watchouts.push({ severity: "medium", title: "Low internal mobility", detail: `Only ${N.formatPct(moverRate)} of continuing staff changed role, team or reporting line — limited internal movement can signal career stagnation.`, actionHint: "Review internal-fill rates and career-path conversations for high-tenure individual contributors.", owner: "Talent Management" });
  }
  if (hasPromo && promoRec >= 3 && hasMoves && byType("Role") === 0) {
    watchouts.push({ severity: "medium", title: "Promotion recommendations not yet actioned", detail: `${promoRec} promotions were recommended in PMS, but no role/title changes appear in the latest snapshot.`, actionHint: "Confirm recommended promotions are being processed into role changes.", owner: "HR Operations" });
  }

  const blurb = hasMoves
    ? `${moverIds.size} internal move${moverIds.size === 1 ? "" : "s"} among ${stayers} continuing staff${hasPromo ? `; ${promoRec} promotions recommended in PMS` : ""}.`
    : `${promoRec} promotions recommended in PMS this cycle — upload another employee snapshot to track actual moves.`;

  return { kind: KIND, label: LABEL, hasData: true, blurb, kpis, charts, tables, watchouts };
}
