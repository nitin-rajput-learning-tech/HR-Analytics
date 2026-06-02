import { useEffect, useMemo, useRef, useState } from "react";
import { FILTER_DIMENSIONS, facets, activeFilterCount, type Filters, type FilterField } from "../../core/filters";
import type { Row } from "../../core/ingest/types";

const SEARCH_DEBOUNCE_MS = 250;

export function FilterBar({
  rows,
  filteredCount,
  filters,
  onChange,
  onExport,
}: {
  rows: Row[];
  filteredCount: number;
  filters: Filters;
  onChange: (f: Filters) => void;
  onExport?: () => void;
}) {
  const facetsByField = useMemo(
    () => Object.fromEntries(FILTER_DIMENSIONS.map((d) => [d.field, facets(rows, d.field)])) as Record<FilterField, ReturnType<typeof facets>>,
    [rows],
  );
  const active = activeFilterCount(filters);

  // Debounce search so each keystroke doesn't re-filter + recompute the whole
  // dashboard (matters at enterprise scale). The input stays instantly
  // responsive via local state; propagation is deferred. A ref holds the latest
  // filters so a concurrent facet toggle isn't stomped by a late search fire.
  const [q, setQ] = useState(filters.search ?? "");
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    setQ(filters.search ?? "");
    window.clearTimeout(timer.current);
  }, [filters.search]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  function onSearchInput(val: string) {
    setQ(val);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onChange({ ...filtersRef.current, search: val }), SEARCH_DEBOUNCE_MS);
  }

  function toggle(field: FilterField, value: string) {
    const cur = filters[field] ?? [];
    const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    onChange({ ...filters, [field]: next.length ? next : undefined });
  }

  return (
    <div className="filterbar no-print">
      <input
        className="search"
        type="search"
        aria-label="Search employees by name, ID, email or title"
        placeholder="Search name, ID, email, title…"
        value={q}
        onChange={(e) => onSearchInput(e.target.value)}
      />
      {FILTER_DIMENSIONS.map((d) => {
        const sel = filters[d.field] ?? [];
        const opts = facetsByField[d.field] ?? [];
        if (opts.length <= 1) return null;
        return (
          <details className="filter" key={d.field}>
            <summary>
              {d.label}
              {sel.length ? <span className="filter-badge">{sel.length}</span> : null}
            </summary>
            <div className="filter-pop">
              {opts.slice(0, 60).map((o) => (
                <label key={o.value} className="filter-opt">
                  <input type="checkbox" checked={sel.includes(o.value)} onChange={() => toggle(d.field, o.value)} />
                  <span className="fv">{o.value}</span>
                  <span className="fc">{o.count.toLocaleString("en-IN")}</span>
                </label>
              ))}
            </div>
          </details>
        );
      })}
      <span className="filter-count">
        {filteredCount.toLocaleString("en-IN")} of {rows.length.toLocaleString("en-IN")}
      </span>
      {active > 0 ? (
        <button className="filter-clear" onClick={() => onChange({})}>
          Clear ({active})
        </button>
      ) : null}
      {onExport ? (
        <button className="filter-export" onClick={onExport}>
          Export CSV
        </button>
      ) : null}

      {active > 0 ? (
        <div className="filter-chips">
          {filters.search?.trim() ? (
            <button className="chip" onClick={() => onChange({ ...filters, search: "" })}>
              “{filters.search}” ✕
            </button>
          ) : null}
          {FILTER_DIMENSIONS.flatMap((d) =>
            (filters[d.field] ?? []).map((v) => (
              <button key={d.field + v} className="chip" onClick={() => toggle(d.field, v)}>
                {d.label}: {v} ✕
              </button>
            )),
          )}
        </div>
      ) : null}
    </div>
  );
}
