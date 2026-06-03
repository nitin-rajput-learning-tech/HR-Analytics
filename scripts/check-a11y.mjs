// CI accessibility gate — WCAG AA colour contrast, enforced with pure math (no
// browser, no deps). Contrast regressions are the most common SILENT a11y break:
// someone nudges a colour token and text quietly drops below 4.5:1. This parses
// the real design tokens out of src/ui/theme.css and checks every text/badge
// pairing in BOTH light and dark themes; a bad colour change fails the build.
//
// Structural a11y (labels, heading order, ARIA roles) is guarded at dev time by
// the axe audit + the editor validation hooks. Contrast is the part that is both
// invisible to the eye AND computable without a browser — so it is what we gate.
//
//   node scripts/check-a11y.mjs   (also runs in `npm run verify` and CI)

import * as fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.resolve("src/ui/theme.css"), "utf8");
const AA = 4.5; // normal + small-bold text threshold

// ---- WCAG 2.1 relative luminance + contrast ratio -------------------------
function toRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}
function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ---- pull design tokens out of theme.css ----------------------------------
function block(selector) {
  const start = css.indexOf(selector);
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}
function rawVars(b) {
  const out = {};
  for (const m of b.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
function resolve(name, scope) {
  const v = scope[name];
  if (!v) return null;
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  if (ref) return resolve(ref[1], scope);
  return /^#[0-9a-fA-F]{3,6}$/.test(v) ? v : null;
}

const lightVars = rawVars(block(":root"));
const darkVars = { ...lightVars, ...rawVars(block('[data-theme="dark"]')) };

// Foreground token → backgrounds it must stay legible on.
const TEXT_PAIRS = [
  ["text", ["bg", "surface", "surface-2"]],
  ["muted", ["bg", "surface", "surface-2"]],
  ["faint", ["bg", "surface"]],
  ["ink", ["bg", "surface"]],
];

const failures = [];

for (const theme of ["light", "dark"]) {
  const v = theme === "light" ? lightVars : darkVars;
  for (const [fg, bgs] of TEXT_PAIRS) {
    const fgHex = resolve(fg, v);
    if (!fgHex) { failures.push(`${theme}: --${fg} is not a resolvable colour`); continue; }
    for (const bg of bgs) {
      const bgHex = resolve(bg, v);
      if (!bgHex) { failures.push(`${theme}: --${bg} is not a resolvable colour`); continue; }
      const ratio = contrast(fgHex, bgHex);
      if (ratio < AA) failures.push(`${theme}: --${fg} on --${bg} = ${ratio.toFixed(2)}:1 (< ${AA})`);
    }
  }
}

// Badge backgrounds (white text) parsed straight from their rules.
const badges = [...css.matchAll(/\.(badge\.sev-\w+|ip-badge\.\w+)\s*\{\s*background:\s*(#[0-9a-fA-F]{6})/g)].map((m) => ({ rule: m[1], hex: m[2] }));
if (badges.length === 0) failures.push("badge background parser matched nothing (selectors changed?)");
for (const b of badges) {
  const ratio = contrast(b.hex, "#ffffff");
  if (ratio < AA) failures.push(`.${b.rule} (${b.hex}) on #fff = ${ratio.toFixed(2)}:1 (< ${AA})`);
}

const checked = TEXT_PAIRS.reduce((n, [, bgs]) => n + bgs.length, 0) * 2 + badges.length;
if (failures.length) {
  console.error(`a11y contrast: ${failures.length} FAILED of ${checked} checks (WCAG AA ${AA}:1)`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`a11y contrast: ${checked} colour pairs pass WCAG AA (${AA}:1) across light + dark themes.`);
