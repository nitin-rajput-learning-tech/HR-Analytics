import { useMemo, useState } from "react";
import { useApp } from "../state";
import { DomainView } from "../components/DomainView";
import { FilterBar } from "../components/FilterBar";
import { ViewsMenu } from "../components/ViewsMenu";
import { directorySection, EMPLOYEE_FIELDS } from "../../core/metrics/people";
import { filterRows, rowsToCsv, type Filters } from "../../core/filters";
import { downloadBlob } from "../download";

export function Directory() {
  const { store, branding, version } = useApp();
  const [filters, setFilters] = useState<Filters>({});

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snap = useMemo(() => store.getLatest("employee_master"), [store, version]);
  const allRows = snap?.rows ?? [];
  const filtered = useMemo(() => filterRows(allRows, filters), [allRows, filters]);
  const metrics = useMemo(() => directorySection(filtered), [filtered]);

  if (!snap) {
    return (
      <div>
        <h2>Employee Directory</h2>
        <p className="muted placeholder">No employee data yet — upload the Employee Master on the Data Intake page.</p>
      </div>
    );
  }

  function exportCsv() {
    downloadBlob(new Blob([rowsToCsv(filtered, EMPLOYEE_FIELDS)], { type: "text/csv;charset=utf-8" }), "employees-filtered.csv");
  }

  return (
    <div>
      <div className="page-head">
        <h2>Employee Directory</h2>
        <p className="page-sub">Browse, search, sort and export the full employee list — filter to drill in.</p>
      </div>
      <div className="views-bar"><ViewsMenu /></div>
      <FilterBar rows={allRows} filteredCount={filtered.length} filters={filters} onChange={setFilters} onExport={exportCsv} />
      <DomainView domain={metrics} accent={branding.accent} dark={branding.theme === "dark"} />
    </div>
  );
}
