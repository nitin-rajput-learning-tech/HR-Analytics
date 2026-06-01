import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { parseWorkbook } from "../../core/ingest/parseWorkbook";
import { ALL_SCHEMAS, getSchema, type DatasetSchema } from "../../core/datasets";
import { templateAoA } from "../../core/intake/template";
import { useApp } from "../state";

// Team order, first-seen, for grouping the picker.
const TEAM_ORDER: string[] = (() => {
  const out: string[] = [];
  for (const s of ALL_SCHEMAS) if (!out.includes(s.team)) out.push(s.team);
  return out;
})();

function downloadTemplate(schema: DatasetSchema) {
  const aoa = templateAoA(schema);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa.data), "Data");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa.dictionary), "Data Dictionary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa.readme), "README");
  XLSX.writeFile(wb, `${schema.kind}_template.xlsx`);
}

export function DataIntake() {
  const { store, bump, version } = useApp();
  const [kind, setKind] = useState<string>("employee_master");
  const [msg, setMsg] = useState<string>("");
  const [ok, setOk] = useState<boolean | null>(null);
  const [asOfOverride, setAsOfOverride] = useState<string>("");

  const schema = getSchema(kind);

  const loaded = useMemo(() => {
    const byKind = new Map<string, { asOf: string; rows: number }>();
    for (const s of store.allSnapshots()) {
      const prev = byKind.get(s.kind);
      if (!prev || s.asOf > prev.asOf) byKind.set(s.kind, { asOf: s.asOf, rows: s.rows.length });
    }
    return [...byKind.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const cand = await parseWorkbook(await file.arrayBuffer(), file.name, schema, asOfOverride || undefined);
      if (cand.status === "imported" && cand.asOf) {
        store.add({
          id: `${cand.kind}:${cand.asOf}`,
          kind: cand.kind,
          asOf: cand.asOf,
          periodLabel: cand.periodLabel,
          sourceFile: cand.sourceFile,
          compatibility: cand.compatibility,
          rows: cand.rows,
        });
        bump();
        setOk(true);
        const note = asOfOverride ? "As-of date set manually." : cand.notes.join(" ");
        setMsg(`Imported ${cand.rowCount} rows into ${schema.label} (as of ${cand.asOf}). ${note}`.trim());
      } else {
        setOk(false);
        setMsg(`Could not import as ${schema.label}: ${cand.notes.join(" ") || "no recognisable rows found."}`);
      }
    } catch (err) {
      setOk(false);
      setMsg(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
    }
    e.target.value = "";
  }

  return (
    <div>
      <h2>Data Intake</h2>
      <p className="muted">
        Pick the domain, upload its workbook (.xlsx), and the dashboards + newsletter update automatically. Need the
        format? Download the template — it carries the exact columns, a data dictionary and a README.
      </p>

      <div className="intake-controls">
        <label>
          Domain
          <br />
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="intake-select">
            {TEAM_ORDER.map((team) => (
              <optgroup key={team} label={team}>
                {ALL_SCHEMAS.filter((s) => s.team === team).map((s) => (
                  <option key={s.kind} value={s.kind}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          As-of date <span style={{ color: "var(--faint)" }}>(optional)</span>
          <br />
          <input type="date" value={asOfOverride} onChange={(e) => setAsOfOverride(e.target.value)} className="intake-select" style={{ minWidth: 0 }} />
        </label>
        <button onClick={() => downloadTemplate(schema)}>Download template</button>
      </div>

      <p className="intake-desc">{schema.description}</p>
      <p className="muted intake-required" style={{ marginBottom: 4 }}>
        Set the as-of date if the filename has no date (e.g. "…as on 5th May.xlsx") — it overrides filename detection.
      </p>
      <p className="muted intake-required">
        Required columns: {schema.fields.filter((fld) => fld.required).map((fld) => fld.label).join(", ") || "none"}
      </p>

      <div className="intake-upload">
        <label>
          Upload {schema.label} (.xlsx)
          <br />
          <input type="file" accept=".xlsx" onChange={onFile} />
        </label>
      </div>
      {msg ? <p className={ok ? "intake-ok" : "intake-err"}>{msg}</p> : null}

      <h3 style={{ marginTop: 28 }}>Loaded data</h3>
      {loaded.length === 0 ? (
        <p className="muted">Nothing uploaded yet.</p>
      ) : (
        <div className="metric-table">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Latest as-of</th>
                  <th>Rows</th>
                </tr>
              </thead>
              <tbody>
                {loaded.map(([k, info]) => (
                  <tr key={k}>
                    <td>{getSchema(k).label}</td>
                    <td>{info.asOf}</td>
                    <td>{info.rows.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
