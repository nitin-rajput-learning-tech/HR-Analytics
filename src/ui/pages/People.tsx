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
import { filterRows, rowsToCsv } from "../../core/filters";
import { downloadBlob } from "../download";

export function People() {
  const { store, branding, version, peopleFilters: filters, setPeopleFilters: setFilters } = useApp();
  const [tab, setTab] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snap = useMemo(() => store.getLatest("employee_master"), [store, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const empSnaps = useMemo(() => store.listByKind("employee_master"), [store, version]);
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
    const representation = buildRepresentation({ employeeRows: filtered, asOf: snap.asOf });
    const orgHealth = buildOrgHealth(filtered);
    return [
      ...people,
      { key: "movement", label: movement.label, metrics: movement },
      { key: "mobility", label: mobility.label, metrics: mobility },
      { key: "risk", label: risk.label, metrics: risk },
      { key: "org_health", label: orgHealth.label, metrics: orgHealth },
      { key: "compensation", label: compensation.label, metrics: compensation },
      { key: "representation", label: representation.label, metrics: representation },
      { key: "pay_equity", label: payEquity.label, metrics: payEquity },
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

  const idx = Math.min(tab, Math.max(0, sections.length - 1));
  const current = sections[idx];

  return (
    <div>
      <div className="page-head">
        <h2>People Analytics</h2>
        <p className="page-sub">Headcount, tenure, diversity, geography, span of control, attrition and data quality — filter or search to drill in.</p>
      </div>
      <div className="views-bar"><ViewsMenu /></div>
      <FilterBar rows={allRows} filteredCount={filtered.length} filters={filters} onChange={setFilters} onExport={exportCsv} />
      <InsightsBanner items={topWatchouts} total={allWatchouts.length} />
      {sections.length === 0 ? (
        <p className="muted placeholder">No employees match the current filters.</p>
      ) : (
        <>
          <div className="tabs">
            {sections.map((s, i) => (
              <button key={s.key} className={i === idx ? "tab active" : "tab"} onClick={() => setTab(i)}>
                {s.label}
              </button>
            ))}
          </div>
          <DomainView domain={current.metrics} accent={branding.accent} dark={branding.theme === "dark"} onDrill={onDrill} />
        </>
      )}
    </div>
  );
}
