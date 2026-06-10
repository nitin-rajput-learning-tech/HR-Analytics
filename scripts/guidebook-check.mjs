// guidebook:check — warn when the in-app user guide may have drifted from the product.
//
// Compares the mtime of the SHIPPED guide (the generated src/help/guidebookHtml.ts,
// refreshed by `npm run embed-guidebook`) against every user-facing source file under
// src/ui and src/core. If any changed more recently, the guide might be stale.
//
// Warn-only (always exits 0): file mtimes aren't meaningful on a fresh clone / CI
// checkout, so this is a developer reminder, not a build gate. Run it after a
// user-facing change; see CONTRIBUTING.md.
//
//   npm run guidebook:check

import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUIDE_SRC = path.join(root, "docs", "guidebook", "hr-analytics-guidebook.html");
const EMBED = path.join(root, "src", "help", "guidebookHtml.ts");

const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };

function walk(dir, acc) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && e.name !== "guidebookHtml.ts") acc.push(full);
  }
  return acc;
}

const shippedTime = mtime(EMBED);
if (!shippedTime) {
  console.warn("guidebook:check: ⚠ embedded guide not found — run `npm run embed-guidebook`.");
  process.exit(0);
}

const files = [path.join(root, "src", "ui"), path.join(root, "src", "core")].flatMap((d) => walk(d, []));
const newer = files.filter((f) => mtime(f) > shippedTime).map((f) => path.relative(root, f).replace(/\\/g, "/"));
const htmlStale = mtime(GUIDE_SRC) > shippedTime;

if (!newer.length && !htmlStale) {
  console.log(`guidebook:check: ✓ in-app guide is current (${files.length} source files checked).`);
  process.exit(0);
}

if (htmlStale) {
  console.warn("guidebook:check: ⚠ docs/guidebook/hr-analytics-guidebook.html is newer than the embedded module — run `npm run embed-guidebook`.");
}
if (newer.length) {
  console.warn(`guidebook:check: ⚠ ${newer.length} source file(s) changed after the guide was last refreshed:`);
  for (const f of newer.slice(0, 25)) console.warn("    " + f);
  if (newer.length > 25) console.warn(`    …and ${newer.length - 25} more`);
  console.warn("  If any USER-FACING behaviour changed, update docs/guidebook/hr-analytics-guidebook.html,");
  console.warn("  then run `npm run embed-guidebook`.  (mtime-based — expected to be noisy on a fresh checkout.)");
}
process.exit(0);
