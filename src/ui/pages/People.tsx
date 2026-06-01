import { useCallback, useMemo, useState } from "react";
import { useApp } from "../state";
import { DomainView } from "../components/DomainView";
import { FilterBar } from "../components/FilterBar";
import { ViewsMenu } from "../components/ViewsMenu";
import { buildPeople, EMPLOYEE_FIELDS } from "../../core/metrics/people";
import { buildMovement } from "../../core/metrics/movement";
import { filterRows, rowsToCsv } from "../../core/filters";

export function People() {
  const { store, branding, version, peopleFilters: filters, setPeopleFilters: setFilters } = useApp();
  const [tab, setTab] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snap = useMemo(() => store.getLatest("employee_master"), [store, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const empSnaps = useMemo(() => store.listByKind("employee_master"), [store, version]);
  const allRows = snap?.rows ?? [];
  const filtered = useMemo(() => filterRows(allRows, filters), [allRows, filters]);
  const sections = useMemo(() => {
    if (!snap) return [];
    const people = buildPeople(filtered, snap.asOf);
    const filteredSnaps = empSnaps.map((s) => ({ ...s, rows: filterRows(s.rows, filters) }));
    const movement = buildMovement(filteredSnaps, { activeHeadcount: filtered.filter((r) => String(r.employment_status) === "Working").length });
    return [...people, { key: "movement", label: movement.label, metrics: movement }];
  }, [filtered, empSnaps, filters, snap]);

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
    const blob = new Blob([rowsToCsv(filtered, EMPLOYEE_FIELDS)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employees-filtered.csv";
    a.click();
    URL.revokeObjectURL(url);
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
