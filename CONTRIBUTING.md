# Contributing

A self-contained, offline, browser-based HR analytics suite. React 18 + TypeScript,
bundled to a single `dist/index.html` by `scripts/build.mjs` (esbuild-wasm). No server,
no external API, no LLM — everything runs in the browser and the user's data never
leaves the device.

## Day-to-day

```bash
npm run verify   # typecheck + tests + single-file build + size/a11y/overflow gates
npm test         # tests only (vitest-shim — see scripts/test.mjs)
npm run build    # produce dist/index.html
```

`npm run verify` is the gate CI runs. Keep it green. The build must stay under the
4 MB single-file budget (`npm run check:size`).

## Keep the in-app user guide in sync

The product ships an **in-app User Guide** (the **Guide** page, also openable with
<kbd>?</kbd> or the command palette). It is a single self-contained, print-ready
HTML doc rendered in an `<iframe srcdoc>`:

- **Source:** `docs/guidebook/hr-analytics-guidebook.html` (edit this)
- **Shipped copy:** `src/help/guidebookHtml.ts` (generated — do not edit by hand)

**After any user-facing change** — a new page or nav entry, a changed keyboard
shortcut, a new/renamed setting, a new dataset or validation rule, a new export, a
changed status enum, or a changed workflow — refresh the guide:

```bash
# 1. update docs/guidebook/hr-analytics-guidebook.html (bump the version/date in the cover + glossary)
# 2. re-embed it into the bundle:
npm run embed-guidebook
# 3. (optional) sanity-check freshness:
npm run guidebook:check
```

`npm run guidebook:check` warns when source files under `src/ui` / `src/core` changed
more recently than the shipped guide. It is a reminder, not a hard gate (file mtimes
aren't reliable on a fresh checkout), so it always exits 0 — wire it into a local
pre-commit hook if you want the nudge automatically.

The guide's reachability and content are covered by `src/help/guide.test.ts`, and the
sample intake pack by `src/core/ingest/intakePack.test.ts` — both run under `npm test`.

## Demo data

The shipped showroom (demo mode) and the sample intake pack are generated from one
synthetic, PII-safe org (`scripts/lib/synthetic-org.mjs`). Never commit real employee
data. Regenerate with:

```bash
npm run sample-workspace && npm run embed-demo   # the embedded demo workspace
npm run intake-pack                              # the sample .xlsx upload pack
```
