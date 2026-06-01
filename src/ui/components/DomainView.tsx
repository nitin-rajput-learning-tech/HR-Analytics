import { useState } from "react";
import { Chart } from "./Chart";
import type { DomainMetrics, MetricKPI, MetricTable, MetricWatchout } from "../../core/metrics/base";

export function KpiCard({ kpi }: { kpi: MetricKPI }) {
  return (
    <div className="kpi">
      <div className="label">{kpi.label}</div>
      <div className="value">{kpi.value}</div>
      {kpi.hint ? <div className="hint">{kpi.hint}</div> : null}
    </div>
  );
}

const cellNum = (v: string | number) => (typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, "")));

export function DataTable({ table }: { table: MetricTable }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const query = q.trim().toLowerCase();
  let rows = query ? table.rows.filter((r) => r.some((c) => String(c).toLowerCase().includes(query))) : table.rows;
  if (sort) {
    const { col, dir } = sort;
    rows = [...rows].sort((a, b) => {
      const an = cellNum(a[col]);
      const bn = cellNum(b[col]);
      const numeric = Number.isFinite(an) && Number.isFinite(bn) && String(a[col]).trim() !== "" && String(b[col]).trim() !== "";
      return (numeric ? an - bn : String(a[col]).localeCompare(String(b[col]))) * dir;
    });
  }
  const toggleSort = (col: number) =>
    setSort((s) => (s && s.col === col ? (s.dir === 1 ? { col, dir: -1 } : null) : { col, dir: 1 }));

  return (
    <div className="metric-table">
      <div className="mt-head">
        <h4>{table.title}</h4>
        {table.rows.length > 10 ? (
          <input className="table-search no-print" type="search" placeholder="Filter rows…" value={q} onChange={(e) => setQ(e.target.value)} />
        ) : null}
      </div>
      {table.caption ? <p className="caption">{table.caption}</p> : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {table.columns.map((c, ci) => (
                <th key={c} className="sortable" onClick={() => toggleSort(ci)} title="Click to sort">
                  {c}
                  <span className="sort-ind">{sort && sort.col === ci ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{typeof cell === "number" ? cell.toLocaleString("en-IN") : cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {query ? (
        <div className="mt-foot">
          {rows.length.toLocaleString("en-IN")} of {table.rows.length.toLocaleString("en-IN")} rows
        </div>
      ) : null}
    </div>
  );
}

export function Watchouts({ items }: { items: MetricWatchout[] }) {
  return (
    <div className="watchouts">
      <h4>Watch-outs</h4>
      {items.map((w, i) => (
        <div className={`watchout sev-${w.severity}`} key={i}>
          <div className="watchout-head">
            <span className={`badge sev-${w.severity}`}>{w.severity}</span>
            <strong>{w.title}</strong>
            {w.owner ? <span className="owner">{w.owner}</span> : null}
          </div>
          <div className="watchout-detail">{w.detail}</div>
          {w.actionHint ? <div className="watchout-action">→ {w.actionHint}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function DomainView({
  domain,
  accent,
  onDrill,
}: {
  domain: DomainMetrics;
  accent?: string;
  onDrill?: (field: string, label: string) => void;
}) {
  if (!domain.hasData) {
    return <p className="muted placeholder">{domain.blurb}</p>;
  }
  return (
    <div className="domain-view">
      <p className="blurb">{domain.blurb}</p>
      {domain.kpis.length > 0 ? (
        <div className="kpis">
          {domain.kpis.map((k) => (
            <KpiCard key={k.label} kpi={k} />
          ))}
        </div>
      ) : null}
      {domain.charts.length > 0 ? (
        <div className="charts">
          {domain.charts.map((c, i) => (
            <Chart key={c.title + i} spec={c} accent={accent} onDrill={onDrill} />
          ))}
        </div>
      ) : null}
      {domain.tables.map((t, i) => (
        <DataTable key={t.title + i} table={t} />
      ))}
      {domain.watchouts.length > 0 ? <Watchouts items={domain.watchouts} /> : null}
    </div>
  );
}
