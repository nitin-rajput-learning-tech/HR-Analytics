// Rebuild the shipped demo workspace (sample-data/Airpay-HR-sample-workspace.json.gz)
// so it carries TWO months of the monthly functional domains — making month-over
// -month deltas/movers visible on first open, without clicking "Generate demo data".
//
// It preserves the existing employee roster (both months) and the PMS cycle from
// the committed workspace, and regenerates the monthly functional domains (TA,
// Payroll, L&D, Admin) for the current + prior month using the same in-app demo
// generators the app uses — so the demo is now reproducible from source rather
// than a hand-made artifact. Re-embed afterwards with:  npm run embed-demo
//
// Uses esbuild-wasm (same as the test runner) so the app's TypeScript runs in
// Node without a native esbuild binary.

import { initialize, build } from "esbuild-wasm";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";

const root = process.cwd();
const p = (rel) => JSON.stringify(path.resolve(root, rel));

const entry = `
import * as fs from "node:fs";
import { loadWorkspace, saveWorkspace } from ${p("src/workspace/workspace.ts")};
import { MemoryStore } from ${p("src/core/store/memoryStore.ts")};
import { generateFunctionalDemo, generatePriorFunctionalMonth } from ${p("src/core/intake/demoData.ts")};

const SRC = ${p("sample-data/Airpay-HR-sample-workspace.json.gz")};
const ws = loadWorkspace(new Uint8Array(fs.readFileSync(SRC)));

// Vendor-neutral demo: rename the sample organisation's legal entities so the
// shipped showroom is brand-agnostic (applied before functional regeneration so
// the synthesized domains inherit the neutral entities).
const ENTITY_MAP = { "Airpay Payment Services Pvt Ltd": "Acme Payments Pvt Ltd", "Airpay Academy Pvt Ltd": "Acme Academy Pvt Ltd" };
const neutralize = (rows) => rows.map((r) => {
  const le = r["legal_entity"];
  if (typeof le === "string" && (ENTITY_MAP[le] || le.includes("Airpay"))) return { ...r, legal_entity: ENTITY_MAP[le] || le.replace(/Airpay/g, "Acme") };
  return r;
});

// Seed a realistic early-attrition pattern into a few leavers so the Retention
// tab demonstrates the quality-of-hire signal (otherwise every demo exit is
// long-tenured and first-year attrition reads a flat 0%). Sets a short tenure
// (date_joined close to last_working_day) on the first few relieved records.
const EARLY_EXIT_TENURE_DAYS = [25, 60, 95, 180, 300];
const seedEarlyExits = (rows) => {
  let n = 0;
  return rows.map((r) => {
    if (n >= EARLY_EXIT_TENURE_DAYS.length) return r;
    if (String(r["employment_status"]) === "Relieved" && String(r["last_working_day"] ?? "")) {
      const lwd = new Date(String(r["last_working_day"]) + "T00:00:00Z");
      if (!Number.isNaN(lwd.getTime())) {
        const doj = new Date(lwd.getTime() - EARLY_EXIT_TENURE_DAYS[n] * 86400000);
        n += 1;
        return { ...r, date_joined: doj.toISOString().slice(0, 10) };
      }
    }
    return r;
  });
};

// Make the demo's managers REAL employees (the source pool was synthetic names
// that matched no one), so leadership-representation analytics resolve a gender.
// Managers are the most-tenured staff per department (~1 per 10 reports) rolling
// up to a single head — and since recent hiring skews more female, the tenured
// leadership realistically lags overall representation.
const assignManagers = (rows) => {
  const s2 = (v) => String(v ?? "").trim();
  const joinMs = (r) => { const t = Date.parse(s2(r["date_joined"])); return Number.isNaN(t) ? Infinity : t; };
  const active = rows.filter((r) => s2(r["employment_status"]) === "Working");
  const byDept = new Map();
  for (const r of active) { const d = s2(r["department"]) || "Other"; if (!byDept.has(d)) byDept.set(d, []); byDept.get(d).push(r); }
  const heads = [];
  for (const list of byDept.values()) {
    const tenured = [...list].sort((a, b) => joinMs(a) - joinMs(b));
    const mgrs = tenured.slice(0, Math.max(1, Math.round(list.length / 10)));
    const mgrSet = new Set(mgrs);
    const mgrNames = mgrs.map((m) => s2(m["full_name"]));
    heads.push(...mgrs);
    let i = 0;
    for (const r of list) { if (!mgrSet.has(r)) { r["reporting_manager"] = mgrNames[i % mgrNames.length]; i += 1; } }
  }
  const top = [...active].sort((a, b) => joinMs(a) - joinMs(b))[0];
  const topName = top ? s2(top["full_name"]) : "";
  for (const h of heads) { if (h !== top) h["reporting_manager"] = topName; }
  if (top) top["reporting_manager"] = "";
  return rows;
};

// Preserve the employee roster (both months) + non-monthly functional cadences.
const store = new MemoryStore();
for (const kind of ["employee_master", "pms_review", "engagement_survey"]) {
  for (const s of ws.store.listByKind(kind)) {
    const rows = kind === "employee_master" ? assignManagers(seedEarlyExits(neutralize(s.rows))) : neutralize(s.rows);
    store.add({ ...s, rows });
  }
}
const emp = store.getLatest("employee_master");
if (!emp) throw new Error("sample workspace has no employee_master");

// Regenerate the monthly functional domains for current + prior month.
const MONTHLY = new Set([
  "ta_requisition", "payroll_aggregate", "payroll_record", "payroll_statutory",
  "ld_program", "ld_enrollment", "admin_asset", "admin_contract", "admin_lifecycle",
]);
const current = generateFunctionalDemo(emp.rows, emp.asOf).filter((s) => MONTHLY.has(s.kind));
const prior = generatePriorFunctionalMonth(emp.rows, emp.asOf);
for (const s of [...prior, ...current]) {
  store.add({ id: s.kind + ":" + s.asOf, kind: s.kind, asOf: s.asOf, periodLabel: s.periodLabel, sourceFile: "(generated demo)", compatibility: "full", rows: neutralize(s.rows) });
}

// Give a realistic share of recent leavers a prior performance review (several
// high-rated) so the existing Regrettable-Attrition analytics light up — the
// source PMS was active-only, leaving "are we losing our best people?" blank.
const empLatest = store.getLatest("employee_master");
const pmsSnap = store.getLatest("pms_review");
if (empLatest && pmsSnap) {
  const relieved = empLatest.rows.filter((r) => String(r["employment_status"]) === "Relieved");
  const have = new Set(pmsSnap.rows.map((r) => String(r["employee_number"])));
  const RATING = [5, 4, 5, 4, 3, 2, 4, 3, 2, 3, 4, 2, 3, 2, 3];
  const POT = ["High", "High", "Medium", "High", "Medium", "Low", "Medium", "Low", "Low", "Medium", "High", "Low", "Medium", "Low", "Medium"];
  const leaverReviews = [];
  relieved.forEach((r, i) => {
    const id = String(r["employee_number"]);
    if (have.has(id)) return;
    leaverReviews.push({ employee_number: id, cycle: "FY26-H1", goals_set: "Y", manager_review_done: "Y", final_rating: RATING[i % RATING.length], rating_scale: "1-5", calibrated: "Y", potential_rating: POT[i % POT.length], promotion_recommended: "N", on_pip: "N", pip_outcome: "" });
  });
  if (leaverReviews.length) store.add({ ...pmsSnap, rows: [...pmsSnap.rows, ...leaverReviews] });
}

// Neutralise the brand wordmark / footer too (Airpay -> Acme).
const branding = { ...ws.branding };
for (const k of ["appName", "footer"]) {
  if (typeof branding[k] === "string" && branding[k].includes("Airpay")) branding[k] = branding[k].replace(/Airpay/g, "Acme");
}

// Fixed timestamp keeps the output deterministic (core stays free of Date.now).
const out = saveWorkspace(store, branding, "2026-05-05T00:00:00.000Z", ws.savedViews, ws.auditLog);
fs.writeFileSync(SRC, Buffer.from(out));
globalThis.__WROTE = {
  bytes: out.length,
  snapshots: store.allSnapshots().length,
  periods: store.allSnapshots().map((s) => s.kind + " " + s.asOf).sort(),
};
`;

await initialize({ worker: false });
const result = await build({
  stdin: { contents: entry, resolveDir: root, loader: "ts", sourcefile: "_buildsample.ts" },
  bundle: true,
  format: "cjs",
  platform: "node",
  target: ["es2020"],
  loader: { ".css": "empty", ".png": "dataurl", ".svg": "dataurl" },
  write: false,
  logLevel: "silent",
});
if (result.warnings.length) for (const w of result.warnings) console.warn("warn:", w.text);

const tmp = path.join(os.tmpdir(), `hr-build-sample-${process.pid}.cjs`);
await writeFile(tmp, result.outputFiles[0].text, "utf8");
createRequire(import.meta.url)(tmp);

const wrote = globalThis.__WROTE;
console.log(`wrote sample-data/Airpay-HR-sample-workspace.json.gz (${wrote.bytes} bytes · ${wrote.snapshots} snapshots)`);
console.log("periods:\n  " + wrote.periods.join("\n  "));
console.log("\nNow run:  npm run embed-demo   (to re-embed into the bundle)");
