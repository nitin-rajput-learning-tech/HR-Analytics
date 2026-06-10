// CI layout-overflow gate — guards the invariants that keep the app from growing a
// horizontal scrollbar, enforced by parsing src/ui/theme.css (no browser, no deps).
//
// Horizontal overflow is THE recurring layout regression here: a wide table, a long
// unbreakable string, or a fixed-width column quietly pushes the page wider than the
// viewport, and it stays invisible until someone views at exactly the wrong width.
// True overflow detection needs a layout engine (a real browser at multiple widths),
// which CI doesn't have — BUT the causes in this app are a small, known set and the
// fixes are specific CSS rules. So this gate fails the build when a known fix is
// removed or a known trap reappears. It's a regression guard for the bugs we've
// already hit (FIX-2 / FIX-2b), not a general layout verifier — view-width checks at
// dev time (browser) remain the catch-all for genuinely new overflow.
//
//   node scripts/check-overflow.mjs   (also runs in `npm run verify` and CI)

import * as fs from "node:fs";
import path from "node:path";

const raw = fs.readFileSync(path.resolve("src/ui/theme.css"), "utf8");
// Strip comments first so a banned token mentioned inside an explanatory comment
// (like this file's own rationale) can't trip — only real declarations count.
const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");

const failures = [];

// Pull a rule's declaration body by selector. Requiring `\s*{` immediately after the
// escaped selector means `.content` matches `.content {` but not `.content-header {`.
// Class-selector bodies are flat (no nested braces), so `[^}]*` is safe here.
function ruleBody(selector) {
  const m = css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}"));
  return m ? m[1] : null;
}

// ---- A) Banned traps (fail if present) ------------------------------------

// 1. 100vw includes the vertical scrollbar's width, so anything sized to it overflows
//    horizontally whenever a page scrollbar is present. Use 100% (or 100dvw).
if (/\b100vw\b/.test(css)) failures.push("`100vw` is present — it includes the scrollbar gutter and overflows horizontally; use 100% instead.");

// 2. A fixed `min-width: <N>px` wider than the smallest supported viewport forces the
//    page past the screen at that width. Grid `minmax(Npx, 1fr)` tracks are fine
//    (auto-fit collapses them) and `(min-width: …)` media features are preceded by
//    `(`, so neither matches this property-position pattern.
const MIN_VIEWPORT = 320;
for (const m of css.matchAll(/(?:^|[;{])\s*min-width:\s*(\d+)px/g)) {
  const n = Number(m[1]);
  if (n > MIN_VIEWPORT) failures.push(`fixed \`min-width: ${n}px\` exceeds the ${MIN_VIEWPORT}px minimum viewport — forces horizontal overflow below ${n}px.`);
}

// ---- B) Required firewalls (fail if removed — each prevents a known bug) ----

const REQUIRED = [
  {
    selector: ".content",
    needle: /min-width:\s*0/,
    why: "the main content column must keep `min-width: 0` so it shrinks below a wide child (table / long string) instead of pushing the whole shell wide — the core fix for the recurring overflow.",
  },
  {
    selector: ".table-scroll",
    needle: /overflow-x:\s*(?:auto|scroll)/,
    why: "wide tables must scroll inside `.table-scroll` (`overflow-x: auto`) rather than widening the page.",
  },
  {
    selector: ".brand-grid",
    needle: /minmax\(\s*0/,
    why: "the Branding form grid must keep a `minmax(0, …)` flexible track so the form column can shrink (regression guard for FIX-2b).",
  },
];
for (const r of REQUIRED) {
  const body = ruleBody(r.selector);
  if (body === null) failures.push(`required rule \`${r.selector}\` not found (renamed?) — ${r.why}`);
  else if (!r.needle.test(body)) failures.push(`\`${r.selector}\` is missing its overflow firewall — ${r.why}`);
}

const checks = 2 + REQUIRED.length;
if (failures.length) {
  console.error(`overflow guard: ${failures.length} FAILED of ${checks} layout invariants`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`overflow guard: ${checks} layout invariants hold (no 100vw / fixed wide min-width; .content / .table-scroll / .brand-grid firewalls intact).`);
