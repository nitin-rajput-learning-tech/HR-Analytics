import { useMemo, useState } from "react";
import { useApp } from "../state";
import { DomainView } from "../components/DomainView";
import { FilterBar } from "../components/FilterBar";
import { directorySection, EMPLOYEE_FIELDS } from "../../core/metrics/people";
import { filterRows, rowsToCsv, type Filters } from "../../core/filters";

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
    const blob = new Blob([rowsToCsv(filtered, EMPLOYEE_FIELDS)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employees-filtered.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="page-head">
        <h2>Employee Directory</h2>
        <p className="page-sub">Browse, search, sort and export the full employee list — filter to drill in.</p>
      </div>
      <FilterBar rows={allRows} filteredCount={filtered.length} filters={filters} onChange={setFilters} onExport={exportCsv} />
      <DomainView domain={metrics} accent={branding.accent} />
    </div>
  );
}
