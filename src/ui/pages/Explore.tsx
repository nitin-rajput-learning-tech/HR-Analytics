import { useMemo, useState } from "react";
import { useApp } from "../state";
import { Chart } from "../components/Chart";
import { combinedEmployeeSnapshot } from "../../core/metrics/combineEmployees";
import { pivotDimensions, pivotMeasures, pivotTable, COUNT_MEASURE, type Agg } from "../../core/metrics/pivot";
import { tableToCsv } from "../../core/filters";
import { downloadBlob } from "../download";

const AGG_LABEL: Record<Agg, string> = { count: "Count", avg: "Average", min: "Minimum", max: "Maximum" };

export function Explore() {
  const { store, version, branding, drillToPeople } = useApp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const snap = useMemo(() => combinedEmployeeSnapshot(store), [store, version]);
  const rows = snap?.rows ?? [];
  const dims = useMemo(() => pivotDimensions(rows), [rows]);
  const measures = useMemo(() => pivotMeasures(rows), [rows]);

  const [groupBy, setGroupBy] = useState("");
  const [measure, setMeasure] = useState("");
  const [agg, setAgg] = useState<Agg>("count");

  const groupField = groupBy && dims.some((d) => d.field === groupBy) ? groupBy : dims[0]?.field ?? "";
  const curMeasure = measures.find((m) => m.field === measure) ?? measures[0];
  const curAgg = curMeasure && curMeasure.aggs.includes(agg) ? agg : curMeasure?.aggs[0] ?? "count";

  const result = useMemo(
    () => (groupField && curMeasure ? pivotTable(rows, { groupBy: groupField, measureField: curMeasure.field, agg: curAgg, asOf: snap?.asOf ?? null }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, groupField, curMeasure?.field, curAgg, snap?.asOf],
  );

  if (!rows.length) {
    return (
      <div className="explore">
        <div className="page-head"><h2>Explore</h2></div>
        <p className="muted placeholder">No employee data yet. Upload the Employee Master on the Data Intake page to build ad-hoc pivots.</p>
      </div>
    );
  }

  const dimLabel = dims.find((d) => d.field === groupField)?.label ?? groupField;
  const fmt = (v: number) => (result?.unit === "yrs" ? `${v} yrs` : v.toLocaleString("en-IN"));

  function exportCsv() {
    if (!result) return;
    const csv = tableToCsv([dimLabel, result.measureLabel, "Headcount"], result.rows.map((r) => [r.group, r.value, r.n]));
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), "explore.csv");
  }

  return (
    <div className="explore">
      <div className="page-head">
        <h2>Explore</h2>
        <p className="page-sub">Build your own view — pick a dimension to group by and a measure. Click a bar or row to drill into People. On-device.</p>
      </div>

      <div className="explore-controls no-print">
        <label>Group by
          <select value={groupField} onChange={(e) => setGroupBy(e.target.value)} aria-label="Group by dimension">
            {dims.map((d) => <option key={d.field} value={d.field}>{d.label}</option>)}
          </select>
        </label>
        <label>Measure
          <select value={curMeasure?.field ?? COUNT_MEASURE} onChange={(e) => setMeasure(e.target.value)} aria-label="Measure">
            {measures.map((m) => <option key={m.field} value={m.field}>{m.label}</option>)}
          </select>
        </label>
        {curMeasure && curMeasure.aggs.length > 1 ? (
          <label>Aggregation
            <select value={curAgg} onChange={(e) => setAgg(e.target.value as Agg)} aria-label="Aggregation">
              {curMeasure.aggs.map((a) => <option key={a} value={a}>{AGG_LABEL[a]}</option>)}
            </select>
          </label>
        ) : null}
        <span className="spacer" />
        <button className="table-csv" onClick={exportCsv}>Export CSV</button>
      </div>

      {result ? (
        <>
          <h3 className="domain-title">{result.measureLabel} by {dimLabel}{result.total !== null ? <span className="muted"> · {result.unit === "yrs" ? `${result.total} yrs overall` : `${result.total.toLocaleString("en-IN")} total`}</span> : null}</h3>
          <Chart
            spec={{ title: `${result.measureLabel} by ${dimLabel}`, caption: "Click a bar to open People Analytics filtered to that value.", kind: "barh", labels: result.rows.slice(0, 15).map((r) => r.group), values: result.rows.slice(0, 15).map((r) => r.value), drill: groupField }}
            accent={branding.accent}
            dark={branding.theme === "dark"}
            onDrill={drillToPeople}
          />
          <div className="metric-table">
            <div className="table-scroll" tabIndex={0} aria-label={`${result.measureLabel} by ${dimLabel}`}>
              <table>
                <thead><tr><th>{dimLabel}</th><th>{result.measureLabel}</th><th>Headcount</th></tr></thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr
                      key={r.group}
                      className="drill-row"
                      onClick={() => drillToPeople(groupField, r.group)}
                      tabIndex={0}
                      role="button"
                      aria-label={`Filter People Analytics by ${r.group}`}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); drillToPeople(groupField, r.group); } }}
                    >
                      <td>{r.group}</td>
                      <td>{fmt(r.value)}</td>
                      <td>{r.n.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
