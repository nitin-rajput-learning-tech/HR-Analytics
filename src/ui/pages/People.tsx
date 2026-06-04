import { useCallback, useMemo, useState } from "react";
import { useApp } from "../state";
import { DomainView } from "../components/DomainView";
import { FilterBar } from "../components/FilterBar";
import { ViewsMenu } from "../components/ViewsMenu";
import { InsightsBanner } from "../components/InsightsBanner";
import { buildPeople, EMPLOYEE_FIELDS } from "../../core/metrics/people";
import { decoratePeopleDeltas, prettyPeriod } from "../../core/metrics/compare";
import { rankWatchouts } from "../../core/metrics/base";
import { buildMovement } from "../../core/metrics/movement";
import { buildRisk } from "../../core/metrics/risk";
import { buildPayEquity } from "../../core/metrics/pay_equity";
import { buildCompensation } from "../../core/metrics/compensation";
import { buildRepresentation } from "../../core/metrics/representation";
import { buildOrgHealth } from "../../core/metrics/orgHealth";
import { buildMobility } from "../../core/metrics/mobility";
import { buildWorkforceCost } from "../../core/metrics/workforceCost";
import { combinedEmployeeSnapshot, employeePeriods } from "../../core/metrics/combineEmployees";
import { buildSourceReconciliation } from "../../core/metrics/sourceReconciliation";
import { getSchema } from "../../core/datasets";

const EMP_SCHEMA = getSchema("employee_master");
const prettyField = (f: string) => EMP_SCHEMA.field(f)?.label ?? f;
import { filterRows, rowsToCsv } from "../../core/filters";
import { downloadBlob } from "../download";

// Group the (now 17) analytics tabs into a two-level nav so the strip never
// overflows and related views sit together. Keys reference section keys built
// below; any key not present (e.g. a domain with no data wired) is skipped.
const TAB_GROUPS: { label: string; keys: string[] }[] = [
  { label: "Workforce", keys: ["overview", "headcount", "tenure", "geography", "managers", "quality", "sources"] },
  { label: "Diversity", keys: ["diversity", "representation", "pay_equity"] },
  { label: "Attrition & Risk", keys: ["attrition", "retention", "risk"] },
  { label: "Movement & Org", keys: ["movement", "mobility", "org_health"] },
  { label: "Pay & Cost", keys: ["compensation", "workforce_cost"] },
];

export function People() {
  const { store, branding, version, peopleFilters: filters, setPeopleFilters: setFilters } = useApp();
  const [activeKey, setActiveKey] = useState("overview");

  // Combined "current" roster across all employee-master sources (e.g. a thin Keka
  // export + a rich HR-maintained snapshot) — see combineEmployees. empSnaps is the
  // period view: one combined period when sources were merged, else the raw series.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snap = useMemo(() => combinedEmployeeSnapshot(store), [store, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const empSnaps = useMemo(() => employeePeriods(store), [store, version]);
  const allRows = snap?.rows ?? [];
  const filtered = useMemo(() => filterRows(allRows, filters), [allRows, filters]);
  // Optional domains that sharpen the attrition-risk signals when loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const enrich = useMemo(
    () => ({ payrollRows: store.getLatest("payroll_record")?.rows ?? null, pmsRows: store.getLatest("pms_review")?.rows ?? null }),
    [store, version],
  );
  const sections = useMemo(() => {
    if (!snap) return [];
    const current = buildPeople(filtered, snap.asOf);
    // Month-over-month KPI deltas: rebuild the prior snapshot (same filters, its
    // own as-of) and diff by label. empSnaps is sorted ascending by asOf, so the
    // prior period is the second-to-last entry.
    const priorSnap = empSnaps.length >= 2 ? empSnaps[empSnaps.length - 2] : null;
    const priorPeople = priorSnap ? buildPeople(filterRows(priorSnap.rows, filters), priorSnap.asOf) : null;
    const priorLabel = priorSnap ? prettyPeriod(priorSnap.periodLabel) : "";
    const people = decoratePeopleDeltas(current, priorPeople, priorLabel);
    const filteredSnaps = empSnaps.map((s) => ({ ...s, rows: filterRows(s.rows, filters) }));
    const movement = buildMovement(filteredSnaps, { activeHeadcount: filtered.filter((r) => String(r.employment_status) === "Working").length });
    const mobility = buildMobility({ employeeSnaps: filteredSnaps, pmsRows: enrich.pmsRows });
    const risk = buildRisk({ employeeRows: filtered, asOf: snap.asOf, payrollRows: enrich.payrollRows, pmsRows: enrich.pmsRows });
    const payEquity = buildPayEquity({ employeeRows: filtered, payrollRows: enrich.payrollRows });
    const compensation = buildCompensation({ employeeRows: filtered, payrollRows: enrich.payrollRows, asOf: snap.asOf });
    const workforceCost = buildWorkforceCost({ payrollRows: enrich.payrollRows, employeeRows: filtered });
    const representation = buildRepresentation({ employeeRows: filtered, asOf: snap.asOf });
    const orgHealth = buildOrgHealth(filtered);
    // Cross-source reconciliation uses the RAW (unfiltered) snapshots — it audits
    // the feeds themselves, not the current filter selection.
    const reconciliation = buildSourceReconciliation(store.listByKind("employee_master"));
    return [
      ...people,
      { key: "movement", label: movement.label, metrics: movement },
      { key: "mobility", label: mobility.label, metrics: mobility },
      { key: "risk", label: risk.label, metrics: risk },
      { key: "org_health", label: orgHealth.label, metrics: orgHealth },
      { key: "compensation", label: compensation.label, metrics: compensation },
      { key: "workforce_cost", label: workforceCost.label, metrics: workforceCost },
      { key: "representation", label: representation.label, metrics: representation },
      { key: "pay_equity", label: payEquity.label, metrics: payEquity },
      { key: "sources", label: reconciliation.label, metrics: reconciliation },
    ];
  }, [filtered, empSnaps, filters, snap, enrich]);

  // Roll every section's watch-outs up into a single cross-tab summary banner.
  const allWatchouts = useMemo(() => sections.flatMap((s) => s.metrics.watchouts), [sections]);
  const topWatchouts = useMemo(() => rankWatchouts(allWatchouts, 4), [allWatchouts]);

  // Drill-down: clicking a chart bar/slice adds that value to its filter field.
  const onDrill = useCallback((field: string, label: string) => {
    setFilters((f) => {
      const cur = (f as Record<string, string[] | undefined>)[field] ?? [];
      return cur.includes(label) ? f : { ...f, [field]: [...cur, label] };
    });
  }, []);

  // Two-level navigation: resolve the active section by key (stable across filter
  // rebuilds), then the group that contains it. Empty groups are dropped. These
  // hooks must run before any early return (Rules of Hooks).
  const byKey = useMemo(() => new Map(sections.map((s) => [s.key, s])), [sections]);
  const groups = useMemo(
    () =>
      TAB_GROUPS.map((g) => ({ label: g.label, items: g.keys.flatMap((k) => { const s = byKey.get(k); return s ? [s] : []; }) })).filter(
        (g) => g.items.length > 0,
      ),
    [byKey],
  );

  if (!snap) {
    return (
      <div>
        <h2>People Analytics</h2>
        <p className="muted placeholder">No employee data yet — upload the Employee Master on the Data Intake page.</p>
      </div>
    );
  }

  function exportCsv() {
    downloadBlob(new Blob([rowsToCsv(filtered, EMPLOYEE_FIELDS)], { type: "text/csv;charset=utf-8" }), "employees-filtered.csv");
  }

  const activeSection = byKey.get(activeKey) ?? groups[0]?.items[0];
  const activeGroup = groups.find((g) => g.items.some((it) => it.key === activeSection?.key)) ?? groups[0];

  return (
    <div>
      <div className="page-head">
        <h2>People Analytics</h2>
        <p className="page-sub">Headcount, tenure, diversity, geography, span of control, attrition and data quality — filter or search to drill in.</p>
      </div>
      <div className="views-bar"><ViewsMenu /></div>
      <FilterBar rows={allRows} filteredCount={filtered.length} filters={filters} onChange={setFilters} onExport={exportCsv} />
      {snap.combinedSources > 1 ? (
        <p className="combined-note">
          🔗 Combined <strong>{snap.combinedSources}</strong> employee data sources into one current roster
          {snap.addedFields.length ? <> — added <strong>{snap.addedFields.map(prettyField).join(", ")}</strong> from the richer snapshot.</> : "."}
        </p>
      ) : null}
      <InsightsBanner items={topWatchouts} total={allWatchouts.length} />
      {sections.length === 0 || !activeSection || !activeGroup ? (
        <p className="muted placeholder">No employees match the current filters.</p>
      ) : (
        <>
          <div className="tab-groups" role="tablist" aria-label="Analytics groups">
            {groups.map((g) => {
              const allEmpty = g.items.every((it) => !it.metrics.hasData);
              return (
                <button
                  key={g.label}
                  role="tab"
                  aria-selected={g === activeGroup}
                  className={`tab-group${g === activeGroup ? " active" : ""}${allEmpty ? " empty" : ""}`}
                  onClick={() => setActiveKey(g.items[0].key)}
                >
                  {g.label}
                </button>
              );
            })}
          </div>
          <div className="tabs">
            {activeGroup.items.map((s) => (
              <button
                key={s.key}
                className={`tab${s.key === activeSection.key ? " active" : ""}${s.metrics.hasData ? "" : " empty"}`}
                onClick={() => setActiveKey(s.key)}
                title={s.metrics.hasData ? undefined : "No data yet — upload the relevant columns/domain"}
              >
                {s.label}
              </button>
            ))}
          </div>
          <DomainView domain={activeSection.metrics} accent={branding.accent} dark={branding.theme === "dark"} onDrill={onDrill} />
        </>
      )}
    </div>
  );
}
