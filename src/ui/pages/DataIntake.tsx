import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { parseWorkbook } from "../../core/ingest/parseWorkbook";
import { suggestColumnMapping } from "../../core/ingest/mapping";
import { ALL_SCHEMAS, getSchema, type DatasetSchema } from "../../core/datasets";
import { templateAoA } from "../../core/intake/template";
import { generateFunctionalDemo, generatePriorEmployeeMonth, generatePriorFunctionalMonth } from "../../core/intake/demoData";
import { combinedEmployeeSnapshot } from "../../core/metrics/combineEmployees";
import { issuesToCsv } from "../../core/ingest/validate";
import type { SnapshotCandidate } from "../../core/ingest/types";
import { downloadBlob } from "../download";
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
  // Build the bytes and route through the shared downloader (XLSX.writeFile has
  // the same detached-anchor naming pitfall as our other downloads).
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${schema.kind}_template.xlsx`);
}

// Compact local time for the activity log (falls back to the raw ISO string).
function fmtTs(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function DataIntake() {
  const { store, bump, version, auditLog, logAudit, mode, commitSnapshot } = useApp();
  const [kind, setKind] = useState<string>("employee_master");
  const [msg, setMsg] = useState<string>("");
  const [ok, setOk] = useState<boolean | null>(null);
  const [asOfOverride, setAsOfOverride] = useState<string>("");
  const [preview, setPreview] = useState<SnapshotCandidate | null>(null);
  // Guided column mapping: keep the uploaded bytes so we can re-parse with a
  // user-edited header→field override (BUILD-1).
  const [fileBuf, setFileBuf] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [override, setOverride] = useState<Record<string, string | null> | null>(null);
  const [showMapping, setShowMapping] = useState<boolean>(false);

  const schema = getSchema(kind);

  function resetUpload() {
    setPreview(null);
    setOverride(null);
    setFileBuf(null);
    setFileName("");
    setShowMapping(false);
  }

  // Re-parse the held file bytes with a (possibly null) column-mapping override.
  async function reparseWith(ov: Record<string, string | null> | null) {
    if (!fileBuf) return;
    const empRows = combinedEmployeeSnapshot(store)?.rows ?? [];
    const knownIds = new Set(empRows.map((r) => String(r.employee_number ?? "").trim()).filter(Boolean));
    const today = new Date().toISOString().slice(0, 10);
    setPreview(await parseWorkbook(fileBuf, fileName, schema, asOfOverride || undefined, knownIds, today, ov ?? undefined));
  }

  // Change one column's mapping (field name, or null to ignore) and re-parse.
  function setMapping(header: string, field: string | null) {
    const base = override ?? (preview ? suggestColumnMapping(preview.detectedHeaders, schema).mapping : {});
    const next = { ...base, [header]: field };
    setOverride(next);
    void reparseWith(next);
  }

  const loaded = useMemo(() => {
    const byKind = new Map<string, { asOf: string; rows: number }>();
    for (const s of store.allSnapshots()) {
      const prev = byKind.get(s.kind);
      if (!prev || s.asOf > prev.asOf) byKind.set(s.kind, { asOf: s.asOf, rows: s.rows.length });
    }
    return [...byKind.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version]);

  // Parse the file and stage it for review — nothing is committed to the store
  // until the user confirms in the preview panel.
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg("");
    setOk(null);
    try {
      const empRows = combinedEmployeeSnapshot(store)?.rows ?? [];
      const knownIds = new Set(empRows.map((r) => String(r.employee_number ?? "").trim()).filter(Boolean));
      // "today" lets the parser resolve a year-less filename date (e.g. "as on 5th
      // May") to the most recent matching date — keeps the core period parser pure.
      const today = new Date().toISOString().slice(0, 10);
      const buf = await file.arrayBuffer();
      setFileBuf(buf);
      setFileName(file.name);
      setOverride(null);
      setShowMapping(false);
      const cand = await parseWorkbook(buf, file.name, schema, asOfOverride || undefined, knownIds, today);
      setPreview(cand);
    } catch (err) {
      setPreview(null);
      setOk(false);
      setMsg(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`);
    }
    e.target.value = "";
  }

  // Commit the previewed snapshot to the store.
  function confirmImport() {
    if (!preview || preview.status !== "imported" || !preview.asOf) return;
    const wasDemo = mode === "demo";
    commitSnapshot({
      id: `${preview.kind}:${preview.asOf}`,
      kind: preview.kind,
      asOf: preview.asOf,
      periodLabel: preview.periodLabel,
      sourceFile: preview.sourceFile,
      compatibility: preview.compatibility,
      rows: preview.rows,
    });
    const label = getSchema(preview.kind).label;
    if (wasDemo) logAudit("Exited demo — started your workspace");
    logAudit(`Published ${label}`, `${preview.rowCount} rows · as of ${preview.asOf}${preview.rowsWithIssues ? ` · ${preview.rowsWithIssues} flagged` : ""}`);
    setOk(true);
    setMsg(`Imported ${preview.rowCount.toLocaleString("en-IN")} rows into ${label} (as of ${preview.asOf}).`);
    resetUpload();
  }

  function downloadIssues() {
    if (!preview || !preview.issues.length) return;
    downloadBlob(new Blob([issuesToCsv(preview.issues)], { type: "text/csv;charset=utf-8" }), `${preview.kind}-import-issues.csv`);
  }

  function generateDemo() {
    const emp = store.getLatest("employee_master");
    if (!emp) {
      setOk(false);
      setMsg("Load an Employee Master first — demo functional data is generated from it.");
      return;
    }
    const priorEmp = generatePriorEmployeeMonth(emp.rows, emp.asOf);
    const priorFns = generatePriorFunctionalMonth(emp.rows, emp.asOf);
    const fns = generateFunctionalDemo(emp.rows, emp.asOf);
    for (const s of [...(priorEmp ? [priorEmp] : []), ...priorFns, ...fns]) {
      store.add({ id: `${s.kind}:${s.asOf}`, kind: s.kind, asOf: s.asOf, periodLabel: s.periodLabel, sourceFile: "(generated demo)", compatibility: "full", rows: s.rows });
    }
    bump();
    setOk(true);
    logAudit("Generated demo data", `${fns.length} functional domains + prior month`);
    setMsg(`Generated demo data for ${fns.length} functional domains, plus a prior month so the dashboards show month-over-month deltas. Every dashboard, Movement & Forecast, and the newsletter are now populated.`);
  }

  // Effective header→field mapping for the editor (user override if set, else the
  // auto-suggestion), plus any required fields still unmapped.
  const effMapping: Record<string, string | null> = preview ? (override ?? suggestColumnMapping(preview.detectedHeaders, schema).mapping) : {};
  const unmappedRequired = preview ? schema.fields.filter((f) => f.required && !Object.values(effMapping).includes(f.name)) : [];

  return (
    <div>
      <h2>Data Intake</h2>
      <p className="muted">
        Pick the domain, upload its workbook (<strong>.xlsx</strong> or <strong>.csv</strong>), review the preview, then
        import. Need the format? Download the template — it includes the exact columns, a data dictionary and a README.
      </p>
      {mode === "demo" ? (
        <p className="intake-demo-note">
          🔬 You're exploring <strong>demo data</strong>. Your first import replaces it with your own data — saved on this
          device and kept across refreshes. Start with the <strong>Employee Master</strong>.
        </p>
      ) : null}

      <div className="intake-controls">
        <label>
          Domain
          <br />
          <select value={kind} onChange={(e) => { setKind(e.target.value); resetUpload(); }} className="intake-select">
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
        The as-of date is read automatically from the filename or the export footer. Set it here only to override.
      </p>
      <p className="muted intake-required">
        Required columns: {schema.fields.filter((fld) => fld.required).map((fld) => fld.label).join(", ") || "none"}
      </p>

      <div className="intake-upload">
        <label>
          Upload {schema.label} (.xlsx / .csv)
          <br />
          <input type="file" accept=".xlsx,.csv" onChange={onFile} />
        </label>
      </div>
      {msg ? <p className={ok ? "intake-ok" : "intake-err"}>{msg}</p> : null}

      {preview ? (
        <div className="import-preview">
          <div className="ip-head">
            <h3>Preview — {getSchema(preview.kind).label}</h3>
            <span className={preview.status === "imported" ? "ip-badge ok" : "ip-badge err"}>
              {preview.status === "imported" ? "Ready to import" : "Rejected"}
            </span>
          </div>

          {preview.detectedHeaders.length > 0 ? (
            <div className="ip-mapping no-print">
              <button type="button" className="link-btn" onClick={() => setShowMapping((v) => !v)}>
                {showMapping ? "Hide column mapping" : `Adjust column mapping (${preview.detectedHeaders.length} columns)`}
              </button>
              {showMapping ? (
                <div className="mapping-panel">
                  <p className="muted mapping-hint">Map each column in your file to a template field, or ignore it — the preview re-parses instantly. <strong>*</strong> marks required fields.</p>
                  {unmappedRequired.length ? (
                    <p className="intake-err mapping-req">Required not yet mapped: {unmappedRequired.map((f) => f.label).join(", ")}.</p>
                  ) : null}
                  <div className="mapping-grid">
                    {preview.detectedHeaders.map((h, i) => (
                      <div className="mapping-row" key={`${h}-${i}`}>
                        <span className="mapping-h" title={h}>{h || "(blank column)"}</span>
                        <span className="mapping-arrow" aria-hidden="true">→</span>
                        <select value={effMapping[h] ?? ""} onChange={(e) => setMapping(h, e.target.value || null)} aria-label={`Map column ${h || `#${i + 1}`} to a field`}>
                          <option value="">— ignore —</option>
                          {schema.fields.map((fld) => <option key={fld.name} value={fld.name}>{fld.label}{fld.required ? " *" : ""}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {preview.status === "imported" ? (
            <>
              <div className="ip-summary">
                <span><strong>{preview.rowCount.toLocaleString("en-IN")}</strong> rows</span>
                <span>as of <strong>{preview.asOf}</strong></span>
                <span><strong>{preview.availableColumns.length}</strong> columns matched</span>
                <span className={preview.rowsWithIssues ? "ip-warn" : "ip-good"}>
                  {preview.rowsWithIssues ? `${preview.rowsWithIssues.toLocaleString("en-IN")} row(s) with issues` : "no validation issues"}
                </span>
              </div>
              {preview.missingColumns.length ? (
                <p className="muted ip-missing">
                  Not in file: {preview.missingColumns.map((c) => getSchema(preview.kind).field(c)?.label ?? c).join(", ")}
                </p>
              ) : null}

              <div className="metric-table">
                <div className="table-scroll" tabIndex={0}>
                  <table>
                    <thead>
                      <tr>{preview.availableColumns.map((c) => <th key={c}>{getSchema(preview.kind).field(c)?.label ?? c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 8).map((row, ri) => (
                        <tr key={ri}>
                          {preview.availableColumns.map((c) => (
                            <td key={c}>{row[c] === null || row[c] === "" ? "—" : String(row[c])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.rowCount > 8 ? <p className="caption">Showing 8 of {preview.rowCount.toLocaleString("en-IN")} rows.</p> : null}
              </div>

              {preview.issues.length ? (
                <div className="ip-issues">
                  <div className="ip-issues-head">
                    <strong>Validation issues ({preview.issues.length.toLocaleString("en-IN")})</strong>
                    <button className="table-csv" onClick={downloadIssues}>Download issues (CSV)</button>
                  </div>
                  <ul>
                    {preview.issues.slice(0, 12).map((iss, k) => (
                      <li key={k}>
                        <span className={`ip-issue-kind k-${iss.kind}`}>{iss.kind.replace(/_/g, " ")}</span>
                        <span className="ip-issue-row">Row {iss.row}</span>
                        {iss.message}
                      </li>
                    ))}
                  </ul>
                  {preview.issues.length > 12 ? (
                    <p className="muted">+{(preview.issues.length - 12).toLocaleString("en-IN")} more — download the CSV for the full list.</p>
                  ) : null}
                  <p className="muted ip-note">Flagged rows still import — fix them at source and re-upload, or import as-is.</p>
                </div>
              ) : null}

              <div className="ip-actions">
                <button onClick={() => setPreview(null)}>Cancel</button>
                <button className="primary" onClick={confirmImport}>Import {preview.rowCount.toLocaleString("en-IN")} rows</button>
              </div>
            </>
          ) : (
            <>
              <p className="intake-err">Could not import as {getSchema(preview.kind).label}: {preview.notes.join(" ") || "no recognisable rows found."}</p>
              <p className="muted">Check that the file uses the template columns and that the period/as-of date is set.</p>
              <div className="ip-actions">
                <button onClick={() => setPreview(null)}>Dismiss</button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {mode === "live" ? (
        <div className="demo-box">
          <div>
            <strong>Generate demo functional data</strong>
            <p className="muted" style={{ margin: "3px 0 0", fontSize: ".84rem", maxWidth: "62ch" }}>
              No TA / PMS / Payroll / L&amp;D / Admin files yet? Generate realistic, organisation-consistent data from your
              loaded Employee Master — keyed to your real employee numbers and departments — to populate every dashboard,
              Movement &amp; Forecast, and the newsletter.
            </p>
          </div>
          <button className="primary" onClick={generateDemo} disabled={!store.getLatest("employee_master")}>
            Generate demo data
          </button>
        </div>
      ) : null}

      <h3 style={{ marginTop: 28 }}>Loaded data</h3>
      {loaded.length === 0 ? (
        <p className="muted">Nothing uploaded yet.</p>
      ) : (
        <div className="metric-table">
          <div className="table-scroll" tabIndex={0}>
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

      <h3 style={{ marginTop: 28 }}>Activity log</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: ".84rem", maxWidth: "62ch" }}>
        A local record of data actions (save, load, publish), kept in the workspace and never sent anywhere — your
        audit trail.
      </p>
      {auditLog.length === 0 ? (
        <p className="muted">No activity recorded yet.</p>
      ) : (
        <ul className="audit-log">
          {[...auditLog].reverse().slice(0, 25).map((e, i) => (
            <li key={auditLog.length - i}>
              <span className="audit-ts">{fmtTs(e.ts)}</span>
              <span className="audit-action">{e.action}</span>
              {e.detail ? <span className="audit-detail">{e.detail}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
