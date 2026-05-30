import React, { useState } from "react";
import { parseWorkbook } from "../../core/ingest/parseWorkbook";
import { EMPLOYEE_MASTER } from "../../core/datasets";
import { useApp } from "../state";

export function DataIntake() {
  const { store, bump } = useApp();
  const [msg, setMsg] = useState("");

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const cand = await parseWorkbook(await file.arrayBuffer(), file.name, EMPLOYEE_MASTER);
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
      setMsg(`Imported ${cand.rowCount} rows (as of ${cand.asOf}).`);
    } else {
      setMsg(`Could not import: ${cand.notes.join(" ")}`);
    }
  }

  return (
    <div>
      <h2>Data Intake</h2>
      <p>Upload the employee master workbook (.xlsx).</p>
      <input type="file" accept=".xlsx" onChange={onFile} />
      {msg && <p>{msg}</p>}
    </div>
  );
}
