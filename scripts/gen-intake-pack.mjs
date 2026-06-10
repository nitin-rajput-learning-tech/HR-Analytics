// Generate the "super demo" sample intake pack — one .xlsx per dataset kind, filled
// with the SAME synthetic Acme organisation that seeds the showroom (same generator,
// same seed → the pack and the showroom tell one consistent story). Each workbook
// uses the schema's human-readable column labels as headers, so it both looks like a
// real team submission AND ingests cleanly through the importer's alias matching.
//
// Output: sample-data/intake-pack/*.xlsx  (+ README.md)
// Run:    npm run intake-pack
//
// Uses esbuild-wasm to run the app's TypeScript demo generators in Node (same
// approach as build-sample-workspace.mjs), then SheetJS to write the workbooks.

import { initialize, build } from "esbuild-wasm";
import { writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { generateAcmeRoster } from "./lib/synthetic-org.mjs";

const root = process.cwd();
const require = createRequire(import.meta.url);
const p = (rel) => JSON.stringify(path.resolve(root, rel));

const DEMO_ASOF = "2026-05-05";
const OUT_DIR = path.resolve(root, "sample-data/intake-pack");

// Stage the synthetic roster (same seed as the showroom) for the TS entry.
const roster = generateAcmeRoster({ activeTarget: 350, leaverCount: 120, asOf: DEMO_ASOF, seed: 7 });
const tmpRoster = path.join(os.tmpdir(), `hr-pack-roster-${process.pid}.json`);
await writeFile(tmpRoster, JSON.stringify(roster), "utf8");

// TS entry: assign reporting lines, synthesize the prior employee month, generate the
// functional domains, and emit a per-kind descriptor (label-mapped headers + rows).
const entry = `
import * as fs from "node:fs";
import { generateFunctionalDemo, generatePriorEmployeeMonth } from ${p("src/core/intake/demoData.ts")};
import { ALL_SCHEMAS } from ${p("src/core/datasets.ts")};

const s2 = (v) => String(v ?? "").trim();
const mayRows = JSON.parse(fs.readFileSync(${JSON.stringify(tmpRoster)}, "utf8"));

// Simple, consistent reporting hierarchy: in each department the ~1-per-10 earliest
// joiners are managers (rolling up to the single most-tenured head), everyone else
// reports to one of them — enough for org-health / span-of-control to populate.
function assignManagers(rows) {
  const joinMs = (r) => { const t = Date.parse(s2(r["date_joined"])); return Number.isNaN(t) ? Infinity : t; };
  const active = rows.filter((r) => s2(r["employment_status"]) === "Working");
  const byDept = new Map();
  for (const r of active) { const d = s2(r["department"]) || "Other"; if (!byDept.has(d)) byDept.set(d, []); byDept.get(d).push(r); }
  const heads = [];
  for (const list of byDept.values()) {
    const tenured = [...list].sort((a, b) => joinMs(a) - joinMs(b));
    const mgrs = tenured.slice(0, Math.max(1, Math.round(list.length / 10)));
    const mgrSet = new Set(mgrs); const mgrNames = mgrs.map((m) => s2(m["full_name"])); heads.push(...mgrs);
    let i = 0;
    for (const r of list) { if (!mgrSet.has(r)) { r["reporting_manager"] = mgrNames[i % mgrNames.length]; i += 1; } }
  }
  const top = [...active].sort((a, b) => joinMs(a) - joinMs(b))[0];
  const topName = top ? s2(top["full_name"]) : "";
  for (const h of heads) { if (h !== top) h["reporting_manager"] = topName; }
  if (top) top["reporting_manager"] = "";
  return rows;
}

assignManagers(mayRows);
// Prior employee month (April) with the same reporting lines, so the pack can demo
// Movement / Forecast once both employee files are uploaded.
const aprilGen = generatePriorEmployeeMonth(mayRows, ${JSON.stringify(DEMO_ASOF)});
const mgr = new Map(mayRows.map((r) => [s2(r["employee_number"]), r["reporting_manager"]]));
const aprilRows = aprilGen.rows.map((r) => mgr.has(s2(r["employee_number"])) ? { ...r, reporting_manager: mgr.get(s2(r["employee_number"])) } : r);

const functional = generateFunctionalDemo(mayRows, ${JSON.stringify(DEMO_ASOF)});
const byKind = { employee_master: mayRows };
for (const snap of functional) byKind[snap.kind] = snap.rows;

const schema = (kind) => ALL_SCHEMAS.find((s) => s.kind === kind);
const descriptor = (kind, rows, period) => {
  const sc = schema(kind);
  return { kind, label: sc.label, team: sc.team, period, fields: sc.fields.map((f) => ({ name: f.name, label: f.label })), rows };
};

// Pack contents: two employee months (enables Movement) + one period of every domain.
const PACK = [
  descriptor("employee_master", aprilRows, "2026-04-05"),
  descriptor("employee_master", mayRows, "2026-05-05"),
  descriptor("ta_requisition", byKind["ta_requisition"], "2026-05"),
  descriptor("pms_review", byKind["pms_review"], "FY26-H1"),
  descriptor("payroll_record", byKind["payroll_record"], "2026-05"),
  descriptor("payroll_aggregate", byKind["payroll_aggregate"], "2026-05"),
  descriptor("payroll_statutory", byKind["payroll_statutory"], "2026-05"),
  descriptor("ld_program", byKind["ld_program"], "2026-05"),
  descriptor("ld_enrollment", byKind["ld_enrollment"], "2026-05"),
  descriptor("admin_asset", byKind["admin_asset"], "2026-05"),
  descriptor("admin_contract", byKind["admin_contract"], "2026-05"),
  descriptor("admin_lifecycle", byKind["admin_lifecycle"], "2026-05"),
  descriptor("engagement_survey", byKind["engagement_survey"], "2026-05"),
  descriptor("headcount_plan", byKind["headcount_plan"], "2026-05"),
];
globalThis.__PACK = PACK;
`;

await initialize({ worker: false });
const result = await build({
  stdin: { contents: entry, resolveDir: root, loader: "ts", sourcefile: "_genpack.ts" },
  bundle: true, format: "cjs", platform: "node", target: ["es2020"],
  loader: { ".css": "empty", ".png": "dataurl", ".svg": "dataurl" },
  write: false, logLevel: "silent",
});
if (result.warnings.length) for (const w of result.warnings) console.warn("warn:", w.text);
const tmpCjs = path.join(os.tmpdir(), `hr-genpack-${process.pid}.cjs`);
await writeFile(tmpCjs, result.outputFiles[0].text, "utf8");
require(tmpCjs);
const PACK = globalThis.__PACK;

// ---- write the workbooks with SheetJS -------------------------------------
const XLSX = require("xlsx");
await mkdir(OUT_DIR, { recursive: true });

// Filename: NN_Domain_period.xlsx — numbered for a natural upload order, period in
// the name so the importer auto-detects the as-of/month.
const slug = (s) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
const fileNames = [];
let seq = 0;
const seen = new Map();
for (const d of PACK) {
  seq += 1;
  // employee_master appears twice (two months) — disambiguate by period.
  const dupe = seen.get(d.kind) ?? 0; seen.set(d.kind, dupe + 1);
  const name = `${String(seq).padStart(2, "0")}_${slug(d.label)}_${d.period}.xlsx`;
  const headers = d.fields.map((f) => f.label);
  const body = d.rows.map((r) => d.fields.map((f) => { const v = r[f.name]; return v == null ? "" : v; }));
  const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, d.kind.slice(0, 31));
  XLSX.writeFile(wb, path.join(OUT_DIR, name));
  fileNames.push({ name, label: d.label, team: d.team, kind: d.kind, rows: d.rows.length });
}

// ---- README ---------------------------------------------------------------
const lines = [];
lines.push("# Acme HR Analytics — Sample Intake Pack");
lines.push("");
lines.push("A fully **synthetic** demo dataset modelled on the shape of a real Indian payments");
lines.push("employer (entity mix, field-sales-heavy workforce, deep hierarchy, gender skew,");
lines.push("attrition concentrated in frontline sales). **No real employee data** — every name,");
lines.push("email and ID is generated, so this pack is safe to share.");
lines.push("");
lines.push("Use it to demonstrate live ingestion: open the tool, go to **Data Intake**, pick the");
lines.push("matching dataset kind, and upload the file. Headers use each domain's standard labels,");
lines.push("so they map automatically. Upload in the numbered order below for the smoothest demo");
lines.push("(the two employee-master months first — they unlock Movement, Forecast and trends).");
lines.push("");
lines.push("| # | File | Dataset kind to select | Team | Rows |");
lines.push("|---|------|------------------------|------|------|");
fileNames.forEach((f, i) => lines.push(`| ${i + 1} | \`${f.name}\` | ${f.label} | ${f.team} | ${f.rows} |`));
lines.push("");
lines.push("**Notes**");
lines.push("- *Payroll* offers two grains — upload **Per-Employee Detail** OR **Department Aggregate**");
lines.push("  (a team shares whichever it can); the Statutory file drives the compliance calendar.");
lines.push("- *Performance* is a half-yearly cycle (FY26-H1); *Engagement* is quarterly — both are");
lines.push("  single-period by design.");
lines.push("- The numbers here match the built-in showroom workspace, so cross-tab figures line up.");
lines.push("");
await writeFile(path.join(OUT_DIR, "README.md"), lines.join("\n"), "utf8");

console.log(`Wrote ${fileNames.length} workbooks + README.md to sample-data/intake-pack/`);
for (const f of fileNames) console.log(`  ${f.name}  (${f.rows} rows)`);
