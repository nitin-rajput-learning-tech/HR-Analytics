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

export function DataTable({ table }: { table: MetricTable }) {
  return (
    <div className="metric-table">
      <h4>{table.title}</h4>
      {table.caption ? <p className="caption">{table.caption}</p> : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {table.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{typeof cell === "number" ? cell.toLocaleString("en-IN") : cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

export function DomainView({ domain, accent }: { domain: DomainMetrics; accent?: string }) {
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
            <Chart key={c.title + i} spec={c} accent={accent} />
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
