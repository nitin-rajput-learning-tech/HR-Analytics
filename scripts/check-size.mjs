// Single-file build size budget gate. The whole app ships as one dist/index.html
// (base64-inlined JS+CSS). This fails CI if that file balloons past the budget,
// so a careless dependency can't silently bloat the download.

import { statSync } from "node:fs";
import path from "node:path";

const BUDGET_MB = 4; // single-file is ~2.6 MB on the basic Plotly bundle; this catches a full-Plotly regression
const BUDGET = BUDGET_MB * 1024 * 1024;
const file = path.resolve("dist/index.html");

let size;
try {
  size = statSync(file).size;
} catch {
  console.error(`check-size: ${file} not found — run "npm run build" first.`);
  process.exit(1);
}

const mb = (size / 1024 / 1024).toFixed(2);
if (size > BUDGET) {
  console.error(`check-size: dist/index.html is ${mb} MB — OVER the ${BUDGET_MB} MB budget.`);
  process.exit(1);
}
console.log(`check-size: dist/index.html is ${mb} MB (budget ${BUDGET_MB} MB) — OK.`);
