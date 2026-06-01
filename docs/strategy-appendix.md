# Deep-dive — Raw Findings Appendix

_Auto-generated evidence behind the Enterprise Product Strategy and Competitive Landscape. 5 codebase audit areas · 12 competitor scopes._

---

## A. Codebase audit

### Architecture, build & scalability — enterprise readiness 3/5

Clean, deliberately layered SPA: a pure, DOM-free analytics core (src/core: 13-schema dataset registry, ingest/coerce/period, in-memory MemoryStore of monthly Snapshots, per-domain metrics/*.compute() -> DomainMetrics, deterministic narrative/newsletter) sits under a thin React 18 UI (src/ui) that only renders those plain objects via Plotly. The standout engineering decision is the esbuild-wasm toolchain (scripts/build.mjs, test.mjs, vitest-shim.mjs): it base64-inlines a minified IIFE + CSS into ONE 7.04 MB dist/index.html with zero native binaries, sidestepping the locked-down-Windows esbuild-Go/winmm.dll crash — a genuinely thoughtful portability fix. The trade-off is the whole model is single-threaded, single-file, and fully in-memory: every snapshot's rows live in a JS Map, save/load is one synchronous pako.gzip(JSON.stringify(allSnapshots)), and there is no Worker, virtualization, IndexedDB, pagination, or streaming anywhere in src. Render performance scales well because every chart/table is pre-capped server-side (top 12/15/20; Directory hard-capped at 1000 rows), so Plotly series never grow with input — the ceiling is the data layer, not the charts. Practical comfort zone is roughly an SMB roster (a few thousand employees x a handful of monthly snapshots); it degrades past ~25-50k rows and breaks (multi-second filter recompute, large GC pauses, slow gzip, risky single-file load) well before true enterprise (100k+ employees, multi-year history). Test coverage of the pure core is strong (112 it() across 26 *.test.ts) but runs through a hand-rolled vitest shim with NO CI — no .github/workflows exists, verification is ad-hoc local verify*.cjs scripts.

**Strengths**
- Genuinely clean separation: src/core is pure and presentation-agnostic (metrics/*.compute() return DomainMetrics objects that BOTH dashboards and the newsletter render via the same DomainView), so the engine is fully unit-testable with environment:node and no DOM — confirmed in scripts/test.mjs and the 26 *.test.ts files.
- esbuild-wasm build (scripts/build.mjs) is a smart, well-documented portability solution: it base64-encodes the JS bundle so the HTML tokenizer can't mis-parse xlsx/Plotly '<script>'/'<!--' byte sequences, and exits explicitly to avoid the wasm service's late stdio errors — addressing real failure modes, not hypothetical ones.
- Render layer is inherently scale-bounded: every chart in metrics (people.ts, cross_functional.ts, payroll.ts, talent_acquisition.ts) slices to top-12/15/20 categories and the Directory table caps at DIRECTORY_CAP=1000 rows, so Plotly trace sizes and DOM node counts stay constant regardless of input volume — the right instinct for browser charting.
- Single source of truth for schemas: datasets.ts ALL_SCHEMAS (13 kinds) centralizes columns, aliases, required/key fields and dtypes; ingest/parseWorkbook.ts header-scoring + coerce reuse it, so adding a domain is one registry entry.
- Strict, modern TypeScript posture (tsconfig.json: strict, noUnusedLocals/Parameters, ES2022/Bundler) plus a documented dual toolchain — esbuild-wasm path for locked-down machines, native vite/vitest kept for unrestricted dev (package.json scripts build:vite, dev, test:vitest).
- Privacy/zero-infra goal is architecturally honored: grep of src finds no fetch/XHR/telemetry; persistence is exclusively the user-held gzipped workspace (workspace.ts) — the offline, single-file claim holds in the actual code.

**Gaps**
- No CI whatsoever: no .github/workflows (confirmed absent) and no .nvmrc; the 112 tests run via a hand-written shim (scripts/vitest-shim.mjs) invoked manually, and quality gates live in untracked local verify3..11.cjs harnesses — nothing enforces typecheck/test on commit or PR.
- Whole data model is in-memory + main-thread with no offload: MemoryStore keeps every Snapshot.rows array in a Map; there is no Worker, IndexedDB, virtualization, or pagination anywhere in src (grep-confirmed). All metric recompute, filtering, gzip and Plotly rendering compete on the UI thread.
- Filter recompute is O(rows) x many passes per keystroke: People.tsx rebuilds buildPeople() for the CURRENT snapshot AND the prior snapshot AND filters every snapshot for movement on each filter/search change; buildPeople runs 8 sections that each do multiple full filter/map/reduce passes over rows — fine at a few thousand rows, multi-second at tens of thousands.
- Single-file load is an all-or-nothing memory cliff: loadWorkspace does pako.ungzip + JSON.parse of the entire payload in one shot; a large multi-snapshot workspace must be fully decompressed and parsed into memory before anything renders, with no streaming or partial load and an effective string-size ceiling on very large files.
- Bundle is dominated by Plotly (node_modules/plotly.js-dist-min/plotly.min.js is 4.56 MB on disk) inlined whole into the 7.04 MB dist; base64-inlining the JS adds ~33% size and the full Plotly library loads even though only 5 chart types (bar/barh/line/pie/funnel in charts.ts) are used — no partial Plotly bundle, code-splitting, or lazy chart import (single-file precludes splitting by design).
- Newsletter (Reports.tsx) mounts every section's DomainView at once, instantiating many Plotly charts synchronously on one page (the heaviest render path) with no lazy/defer; combined with window.print() PDF export this is the most likely place to jank or stall on a data-rich workspace.
- Directory beyond 1000 rows is silently truncated in the UI (people.ts DIRECTORY_CAP) — correct for perf but a functional ceiling: users above ~1000 matching employees must rely on filters or CSV export rather than the on-screen table.

**Scalability notes**
- Max practical row volume: comfortable at SMB scale (~a few thousand employees x a handful of monthly snapshots). Degrades around 25-50k total rows because People.tsx recomputes buildPeople for current+prior snapshots plus per-snapshot movement filtering on every filter/search keystroke, each section doing multiple full O(rows) passes (people.ts).
- Plotly render performance is the LEAST constrained dimension: charts.ts supports only bar/barh/line/pie/funnel and every metrics module pre-slices to top 12/15/20 categories, so trace sizes are constant regardless of input; Chart.tsx uses Plotly.react diffing and purge-on-unmount. Render risk concentrates in Reports.tsx, which mounts all newsletter sections (many charts) at once.
- Bundle: dist/index.html is exactly 7,386,745 bytes (7.04 MB). Dominated by Plotly (plotly.min.js = 4.56 MB on disk) inlined whole; base64-inlining the JS adds ~33% overhead. Single-file design precludes code-splitting/lazy-loading; full Plotly loads despite 5 chart types used.
- Memory & load: everything is in-memory — MemoryStore holds every Snapshot.rows in a Map (memoryStore.ts), and workspace.ts save/load is a single synchronous pako.gzip(JSON.stringify(...)) / ungzip+JSON.parse of the entire payload, an all-or-nothing cliff with an effective string-size ceiling on large multi-snapshot workspaces.
- No scaling escape hatches in src: grep confirms no Web Worker, requestIdleCallback, virtualization/react-window, IndexedDB, localStorage, or pagination — all compute, gzip and render are synchronous on the UI thread.
- Where it breaks at enterprise scale (100k+ employees, multi-year monthly history, multi-user, RBAC/audit): the single-file in-browser model cannot get there — multi-second recompute, large GC pauses, slow whole-file gzip/parse, a 1000-row Directory cap, and a ~7 MB single-file load make it unsuitable; that scale needs a server/columnar tier the architecture does not have (by explicit design).

**Recommendations**
- Add CI (GitHub Actions) running npm ci, npm run typecheck, and npm test on push/PR, plus a build-size check that fails if dist/index.html grows beyond a threshold; pin Node via .nvmrc and delete or fold the untracked verify*.cjs harnesses into the suite so quality gates are reproducible, not local-only.
- Shrink the bundle by replacing plotly.js-dist-min (4.56 MB) with a custom partial Plotly build importing only bar/scatter/pie/funnel traces (the only kinds charts.ts emits) — realistically a multi-MB cut on a 7 MB file — and gzip-serve dist/index.html so the ~7 MB transfers as ~1.5-2 MB over https.
- Move heavy work off the UI thread / cap recompute: memoize per-snapshot buildPeople results keyed by snapshot id+filters (today the prior snapshot and movement are rebuilt on every keystroke), debounce the search input, and push parse + metric compute into a Web Worker so large datasets don't freeze the tab.
- State the supported scale explicitly in README/docs (e.g. 'tuned for up to ~5-10k employees x ~24 monthly snapshots; larger datasets degrade') and gate ingestion with a row-count warning, so the SMB-shaped ceiling is a documented product boundary rather than a silent cliff.
- For data-volume headroom without abandoning offline-first, persist snapshots to IndexedDB and lazy-load per-domain rows on demand instead of holding every Snapshot.rows in one Map and round-tripping the entire workspace through a single JSON.stringify/parse; lazy-mount newsletter chart sections (IntersectionObserver) to avoid instantiating all Plotly figures at once.
- If true enterprise scale (100k+ rows, multi-year history, concurrent HR users, RBAC, audit) is ever a goal, recognize it is out of scope for the single-file in-browser model and would require a server/columnar-store tier — keep the current pure-core/UI split (it ports cleanly) but treat browser single-file as the SMB/portable edition.

**Files cited:** D:\Claude Local\HR-Analytics-repo\package.json, D:\Claude Local\HR-Analytics-repo\scripts\build.mjs, D:\Claude Local\HR-Analytics-repo\scripts\test.mjs, D:\Claude Local\HR-Analytics-repo\scripts\vitest-shim.mjs, D:\Claude Local\HR-Analytics-repo\src\core\store\memoryStore.ts, D:\Claude Local\HR-Analytics-repo\src\core\store\types.ts, D:\Claude Local\HR-Analytics-repo\src\workspace\workspace.ts, D:\Claude Local\HR-Analytics-repo\src\core\charts.ts, D:\Claude Local\HR-Analytics-repo\src\ui\components\Chart.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\components\DomainView.tsx, D:\Claude Local\HR-Analytics-repo\src\core\metrics\people.ts, D:\Claude Local\HR-Analytics-repo\src\ui\pages\People.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\pages\Reports.tsx, D:\Claude Local\HR-Analytics-repo\src\core\filters.ts, D:\Claude Local\HR-Analytics-repo\src\core\ingest\parseWorkbook.ts, D:\Claude Local\HR-Analytics-repo\src\core\datasets.ts, D:\Claude Local\HR-Analytics-repo\src\core\intake\demoData.ts, D:\Claude Local\HR-Analytics-repo\src\ui\state.tsx, D:\Claude Local\HR-Analytics-repo\src\main.tsx, D:\Claude Local\HR-Analytics-repo\index.html, D:\Claude Local\HR-Analytics-repo\tsconfig.json, D:\Claude Local\HR-Analytics-repo\vite.config.ts, D:\Claude Local\HR-Analytics-repo\dist\index.html

---

### Feature inventory & UX maturity — enterprise readiness 3/5

The app is a genuinely substantial, single-file offline HR-analytics tool with 6 pages and a wide, real metric surface: People Analytics carries 8 deep employee-master sections (Overview, Headcount/Org, Tenure, Diversity, Geography, Managers/span-of-control, Attrition & pending exits, Data Quality) plus a Movement & Forecast section derived purely from diffing monthly snapshots (recency-weighted projection with a ±10% scenario band). Function Analytics adds 5 functional domains (TA, PMS, L&D, Payroll, HR Ops) and a Cross-Functional risk cross-cut (compound-risk depts, est. 12m attrition cost, regrettable exits). All domains share a clean pure-data contract (DomainMetrics: KPIs+charts+tables+watch-outs in base.ts) rendered uniformly via DomainView/Chart (Plotly) and re-rendered as a printable, deterministic newsletter. The interaction layer is well above prototype grade: faceted filter bar with live counts and dismissible chips, chart click drill-down that even crosses pages into a filtered People view, month-over-month KPI deltas, saved views, a fuzzy-ranked command palette (Ctrl/Cmd-K), a cross-tab 'needs attention' insights banner, toasts, sortable/searchable tables, and CSV/PNG export at table, chart and dataset level, all under full light/dark white-label theming with a live brand preview and gzip workspace save/load. The clearest maturity gaps versus enterprise BI/HR tools are accessibility (almost no ARIA, no focus management/visible focus, no keyboard nav for tabs/filters), responsiveness (only two CSS breakpoints — effectively desktop-only), single-snapshot trending outside People (functional domains have no period comparison), and no row-level drill-through to an employee profile, scheduling/sharing, or undo.

**Strengths**
- Exceptional analytical depth on people data: src/core/metrics/people.ts computes 8 sections with KPIs, drill-enabled charts, breakdown tables AND threshold-based watch-outs (e.g. early-tenure concentration >=45%, span-of-control with pending-exit/early-tenure load, key-field completeness) — far richer than a typical dashboard.
- Strong, consistent component architecture: every domain (people + 5 functions + cross-functional + movement) emits the same DomainMetrics shape (src/core/metrics/base.ts) rendered by one DomainView (src/ui/components/DomainView.tsx), so the dashboard and the printable newsletter (src/reports/newsletter.ts, src/ui/pages/Reports.tsx) reuse identical chart/table specs.
- Genuinely useful interactivity: chart drill-down maps a clicked bar/slice to a filter field and can jump cross-page into a filtered People view (src/ui/components/Chart.tsx + state.tsx drillToPeople), backed by a faceted filter bar with counts and removable chips (src/ui/components/FilterBar.tsx).
- Smart zero-config trending: Movement & Forecast derives joiner/leaver events by diffing consecutive employee snapshots — no events table required — and degrades gracefully to an 'upload another month' state (src/core/metrics/movement.ts).
- Polished power-user and white-label UX: Ctrl/Cmd-K command palette with AND-term ranking (src/ui/commands.ts), saved views, MoM KPI delta chips, cross-tab insights banner (src/ui/components/InsightsBanner.tsx), and full theme/logo/preset branding with live preview and theme import/export (src/ui/pages/Branding.tsx).
- Pragmatic export/portability story: per-table and per-chart CSV/PNG plus filtered-dataset CSV, a markdown facts pack, print-to-PDF newsletter, and gzipped workspace save/load (src/ui/AppShell.tsx), all offline.

**Gaps**
- Accessibility is near-absent — across the entire stylesheet there are only 4 a11y-relevant rules; the only ARIA is role=status on toasts (toast.tsx) and aria-modal on the palette (CommandPalette.tsx). Tab strips and filter facets are click-only with no keyboard navigation, no focus trap in the modal/popovers, and theme.css defines no :focus-visible styling — failing basic WCAG/enterprise procurement bars.
- Effectively desktop-only: theme.css has just two breakpoints (760px, 860px) collapsing the brand grid and one layout; the sidebar nav, filter bar, KPI grids, wide tables and Plotly charts have no tablet/mobile treatment.
- Period comparison is People-only: decoratePeopleDeltas powers MoM deltas for employee metrics, but the 5 functional domains and the cross-functional view are computed from a single latest snapshot (src/core/metrics/index.ts) with no trend lines or deltas — a gap vs enterprise tools where every KPI trends.
- No row-level drill-through: charts filter and tables sort/search/export, but there is no click-through from a manager, department or pending-exit row to an individual employee profile or a filtered employee subset view; the Directory caps at 1000 rows (DIRECTORY_CAP in people.ts) with no pagination.
- Operational/collaboration features expected of enterprise BI are absent: no scheduled refresh or email/share of the newsletter (only manual browser print), no alert subscriptions, no annotations/comments, and no undo/redo for filter or branding changes.
- Data intake is low-assurance for non-technical HR users: one domain at a time, no pre-import preview grid, no column-mapping UI for mismatched headers, and only a single pass/fail message (src/ui/pages/DataIntake.tsx) — error recovery and validation transparency lag behind enterprise import wizards.

**Scalability notes**
- Directory rendering is hard-capped at 1000 rows (DIRECTORY_CAP, people.ts) and DataTable renders all matching rows into the DOM without virtualization (DomainView.tsx) — large employee masters (tens of thousands) will strain tables and the in-memory facet/metric recomputation that runs on every filter change.
- All metrics recompute synchronously in useMemo on the render thread (People.tsx, FunctionAnalytics.tsx); there is no web-worker offload, so big datasets or many snapshots could cause visible jank on filter/drill interactions.
- Plotly is imported as plotly.js-dist-min in every Chart instance (Chart.tsx) and the whole app ships as one inlined index.html — strong for portability but a heavy single payload, with no lazy-loading/code-splitting of charting per page.

**Recommendations**
- Close the accessibility gap as a first-class workstream: add :focus-visible styles, make the tab strips and filter facets keyboard-operable (roving tabindex / arrow keys), add a focus trap + Esc handling consistently to the command palette and filter/views popovers, and label icon-only buttons (PNG/CSV/dismiss) with aria-label.
- Add responsive layouts: introduce mobile/tablet breakpoints for the sidebar (collapsible drawer), KPI grids, filter bar, and horizontally-scrollable tables/charts so the single-file app is usable on a laptop-to-tablet range, not just wide desktops.
- Extend month-over-month deltas and trend sparklines to the functional and cross-functional domains (mirror decoratePeopleDeltas) so TA/PMS/Payroll/L&D/Ops KPIs trend like the People metrics — the snapshot store already retains history.
- Add row-level drill-through: clicking a manager/department/pending-exit table row should open that employee subset (reuse drillToPeople) or an individual employee profile panel, and add pagination to the Directory beyond the 1000-row cap.
- Improve the data-intake experience for HR users: a pre-import preview with detected as-of date, a header-to-field mapping step for near-miss columns, inline per-column validation counts, and the ability to stage multiple workbooks before publishing.
- Add lightweight collaboration/operational affordances that stay offline-friendly: undo/redo for filters and branding, a 'copy shareable workspace link/file' affordance, and newsletter section annotations, to narrow the gap with enterprise reporting suites.

**Files cited:** D:\Claude Local\HR-Analytics-repo\src\ui\AppShell.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\state.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\pages\People.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\pages\Directory.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\pages\FunctionAnalytics.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\pages\Reports.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\pages\DataIntake.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\pages\Branding.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\components\DomainView.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\components\Chart.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\components\FilterBar.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\components\CommandPalette.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\components\InsightsBanner.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\components\ViewsMenu.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\commands.ts, D:\Claude Local\HR-Analytics-repo\src\ui\toast.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\theme.css, D:\Claude Local\HR-Analytics-repo\src\core\metrics\index.ts, D:\Claude Local\HR-Analytics-repo\src\core\metrics\base.ts, D:\Claude Local\HR-Analytics-repo\src\core\metrics\people.ts, D:\Claude Local\HR-Analytics-repo\src\core\metrics\movement.ts, D:\Claude Local\HR-Analytics-repo\src\core\metrics\cross_functional.ts, D:\Claude Local\HR-Analytics-repo\src\core\metrics\talent_acquisition.ts, D:\Claude Local\HR-Analytics-repo\src\core\filters.ts, D:\Claude Local\HR-Analytics-repo\src\core\datasets.ts, D:\Claude Local\HR-Analytics-repo\src\reports\newsletter.ts

---

### Data model & extensibility — enterprise readiness 3/5

The data model is a clean, declarative dataset-kind registry (src/core/datasets.ts): a DatasetSchema class with 13 kinds spanning employee_master + TA/PMS/Payroll/L&D/HR-Admin/Planning, each carrying typed fields, header aliases, key fields, period kind (month/cycle/as_of) and grain (detail/aggregate). Adding a NEW DOMAIN is genuinely easy on the data side — one schema constant added to ALL_SCHEMAS auto-derives the lookup map, intake template (Data + Dictionary + README), and the UI domain picker. Real ingest, however, is a single thin path: parseWorkbook (xlsx-only) does fuzzy header-matching against the alias map across the first 10 rows of each sheet, coerces by dtype, and infers the period from the FILENAME (with an optional manual as-of override). This is solid for the demo/single-analyst workflow it targets, but several reliability primitives required for real multi-source HR data are absent: enum (allowed) values are declared but never validated; there is no per-row rejection/error report (rows lacking a key are silently dropped); there is no CSV/Google-Sheets/HRIS-export path; no cross-snapshot referential integrity (orphan employee_number across domains is never flagged at intake); re-uploading a period silently overwrites (snapshot id = kind:asOf); and loadWorkspace checks format but not version, so there is no schema-migration story. Cross-domain joins exist only inside cross_functional.ts (keyed on employee_number) and degrade gracefully, but per-domain analytics are wired through a hardcoded switch in metrics/index.ts, so a new domain still touches the dispatcher + a metrics module, not just the registry. Net: an excellent, well-factored prototype data layer with a clear extension pattern, but intake hardening and validation are needed before real, messy, multi-team data can be trusted.

**Strengths**
- Declarative single-source-of-truth registry (src/core/datasets.ts): DatasetSchema encodes fields/dtypes/required/allowed/keyFields/periodKind/grain/headerAliases; ALL_SCHEMAS auto-derives DATASET_SCHEMAS, GENERIC_KINDS, allTeams() and schemasForTeam() — adding a kind is one constant + one array entry.
- Schema drives everything downstream automatically: templateAoA (src/core/intake/template.ts) generates the Data + Data-Dictionary + README workbook purely from the schema, and DataIntake.tsx builds the grouped domain picker from ALL_SCHEMAS/team — no per-domain UI code.
- Pragmatic, forgiving ingest in parseWorkbook.ts: scores every sheet's first 10 rows against schema.aliasMap() (canonical names + labels + explicit aliases), auto-detects the header row/sheet, and classifies fit as full / compatible_with_warnings / partial / rejected via required-vs-key-field logic.
- Robust per-type coercion (coerce.ts): strips currency/commas/spaces for numbers, Y/N/true/1 boolean parsing, and timezone-aware date handling (SheetJS Date objects read via local components to avoid day-shift) — sensible for Indian-formatted spreadsheets.
- Flexible period model (period.ts) supports month, fiscal cycle (FY26-H1/Q1..Q4/FULL) and as_of grains from the filename, with a manual as-of override in the UI for files like 'as on 5th May.xlsx'.
- Demo generators (demoData.ts) are deterministic (seeded LCG) and organisation-consistent — every TA/PMS/Payroll/L&D/Admin row references real employee_numbers/departments from the loaded master, plus a synthesised prior employee month so Movement & Forecast work; strong for eval before real data exists.
- Cross_functional.ts demonstrates the intended multi-domain join model: all signals key on employee_number against the employee master, weights renormalise when a domain is absent, so the model degrades gracefully as sources arrive piecemeal.

**Gaps**
- Validation is advisory only: the allowed enum lists (e.g. status, statutory_type, payroll_status) are declared on every field but the only consumer is template.ts (printed in the dictionary). coerce.ts never checks them, so out-of-vocabulary values (e.g. status='Closed') flow into metrics silently.
- No per-row error/rejection reporting: parseWorkbook drops any row missing all keyFields (parseWorkbook.ts ~L55) and reports only an aggregate rowCount/missingColumns — a real file with 50 bad rows out of 5000 gives no row-level feedback, no preview, no downloadable error log.
- Single ingest format: DataIntake.tsx accepts only .xlsx (accept='.xlsx'); every .csv reference in src is export-only. No CSV, Google Sheets, or direct HRIS/Keka/Darwinbox export ingestion, and no multi-file/folder batch upload.
- No referential integrity across snapshots: nothing validates that employee_number in pms_review/payroll/ld/admin/asset exists in employee_master, or that ld_enrollment.program_id matches an ld_program. Orphan FKs are only implicitly ignored during cross_functional joins, never surfaced as a data-quality watch-out at intake.
- Silent period overwrite: MemoryStore.add does snaps.set(kind:asOf) (memoryStore.ts L7), so re-uploading the same month/cycle overwrites the prior import with no warning, merge, or append — risky for correction workflows and multi-team submissions for the same period.
- No workspace versioning/migration: loadWorkspace (workspace.ts) validates format but ignores the version:1 field and does no migration — once schemas evolve, older saved .gz workspaces have no upgrade path and may silently mis-bind columns.
- Domain analytics are not registry-driven end-to-end: metrics/index.ts uses a hardcoded switch over DOMAIN_ORDER with literal kind strings (rowsOf(store,'ta_requisition') etc.), so a genuinely new domain requires edits to the dispatcher, DOMAIN_ORDER/labels, a metrics module, and cross_functional — not just a schema entry.
- Date coercion asymmetry: Date objects use local Y/M/D while string dates are parsed as UTC (coerce.ts L33-42); mixed-source files (some cells typed as dates, some as text) can land on inconsistent calendar days, and no field-level format hint constrains this.

**Scalability notes**
- In-memory only: MemoryStore holds every snapshot's full rows in a Map and the entire workspace serialises to one gzipped JSON blob (workspace.ts) — fine for a few thousand employees/months, but per-employee detail kinds (payroll_record, ld_enrollment, ta_requisition) at large headcounts over many months will inflate browser memory and the saved-file size with no pagination or columnar storage.
- getLatest()/listByKind() re-scan and re-sort all snapshots on every call (memoryStore.ts) and the dashboard recomputes pure metrics each render; acceptable now, but cost grows linearly with snapshot count and there is no memoisation/index by kind.
- parseWorkbook materialises the whole sheet to an array-of-arrays twice (scan + extract) and builds full rows in memory; very large workbooks are parsed synchronously on the main thread with no streaming or web-worker offload, risking UI jank.
- cross_functional.ts builds several Maps over all active employees plus per-domain passes; complexity is linear and gated by MIN_DEPT_ACTIVE, so it scales reasonably, but it depends on every domain's LATEST snapshot only — no multi-period trend storage means history depth is bounded by how many monthly files the user keeps loaded.

**Recommendations**
- Add a real validation pass after coercion: enforce field.allowed enums, required-field presence per row, and basic range/format checks; extend SnapshotCandidate with per-row issues (row index, field, reason) and a 'warnings' bucket, then surface a preview + downloadable rejected-rows report in DataIntake.tsx instead of only an aggregate message.
- Introduce a referential-integrity check at commit time: validate employee_number (and program_id, requisition links) against the latest employee_master snapshot, count orphans, and emit a data-quality watch-out rather than silently dropping/ignoring them; expose it on the existing 'needs attention' banner.
- Add a CSV ingest path (and ideally a generic delimited/Google-Sheets export) sharing the same alias-matching + coerce pipeline; relax accept='.xlsx' and support multi-file batch upload so a month's worth of team files can be dropped at once.
- Make snapshot writes safe: detect an existing kind:asOf on add() and require explicit replace-vs-append, or version snapshots by import time; show the user that a prior import for that period will be overwritten.
- Add workspace schema versioning: bump WorkspaceFile.version on every datasets.ts change, write a migration ladder in loadWorkspace, and warn (not silently bind) when a saved file predates the current schema; persist the registry hash so column drift is detectable.
- Drive per-domain metrics from the registry to fully realise the extensibility promise: register each domain's required kinds + a compute(rows-by-kind) factory in a map so adding a domain is a schema entry + a metrics module, eliminating hand-edits to the metrics/index.ts switch, DOMAIN_ORDER and cross_functional wiring.
- Strengthen period detection for real-world filenames: support common Indian/HRIS naming (Mon-YYYY, DD-MM-YYYY, 'Q1 FY26'), and prompt for confirmation when confidence < 1 instead of relying on the optional manual override being remembered.

**Files cited:** D:\Claude Local\HR-Analytics-repo\src\core\datasets.ts, D:\Claude Local\HR-Analytics-repo\src\core\ingest\parseWorkbook.ts, D:\Claude Local\HR-Analytics-repo\src\core\ingest\coerce.ts, D:\Claude Local\HR-Analytics-repo\src\core\ingest\period.ts, D:\Claude Local\HR-Analytics-repo\src\core\ingest\types.ts, D:\Claude Local\HR-Analytics-repo\src\core\intake\template.ts, D:\Claude Local\HR-Analytics-repo\src\core\intake\demoData.ts, D:\Claude Local\HR-Analytics-repo\src\core\store\memoryStore.ts, D:\Claude Local\HR-Analytics-repo\src\core\store\types.ts, D:\Claude Local\HR-Analytics-repo\src\core\metrics\index.ts, D:\Claude Local\HR-Analytics-repo\src\core\metrics\cross_functional.ts, D:\Claude Local\HR-Analytics-repo\src\ui\pages\DataIntake.tsx, D:\Claude Local\HR-Analytics-repo\src\workspace\workspace.ts, D:\Claude Local\HR-Analytics-repo\docs\reports-suite-plan.md

---

### Analytics depth & methodology (src/core/metrics, src/core/narrative, src/reports) — enterprise readiness 2/5

The analytics layer is clean, pure, well-tested, and correct for descriptive HR reporting: headcount/org, tenure bands, diversity, geography, span of control, pending/derived attrition, data quality, plus per-function (TA/PMS/L&D/Payroll/Admin) and a cross-functional compound-risk cut. Event derivation by snapshot-diffing (movement.ts) is a genuinely sound, well-reasoned design. However, "depth" stops at descriptive aggregation. The "forecast" (movement.ts) is a recency-weighted mean plus a 2-point-guarded OLS slope with a FIXED ±10% scenario band that the code/tests mislabel a "confidence band" — there is no statistical uncertainty, no seasonality, no cohort/survival modeling, and net leavers are extrapolated linearly. The watch-out and narrative engines are deterministic if/threshold rules with hardcoded literals and no configurability, benchmarking, or org-specific targets. Statistical rigor is essentially absent: only means (no medians, percentiles, dispersion, or significance), and the cross-functional "risk score" is a relative min-max normalization across the current snapshot's eligible departments (so the 0–100 score is not comparable across orgs/periods and collapses to 0 when values are tight or departments are few). This is solid prototype/SMB-grade descriptive analytics, well short of enterprise predictive/statistical/benchmarking expectations.

**Strengths**
- Metric correctness for descriptive KPIs is sound and defensively coded: consistent null/NaN guards, safe pct() denominator checks (narrative.ts:27-36), Indian/INR money formatting (humanizeMoneyInr, narrative.ts:17-25), and en-IN grouping; KPIs are pure functions over a snapshot and unit-tested per domain.
- Event derivation is genuinely well-designed: deriveEmployeeEvents (movement.ts:35-67) diffs consecutive employee-master snapshots to infer joiners/leavers with no events table, and dates exits within the (prev, cur] window only when last_working_day actually falls in range to avoid scattering stale LWDs into old months (movement.ts:56-60).
- Graceful degradation is consistent and a real strength: <2 snapshots yields a clear 'upload another month' state (movement.ts:152-164); cross_functional.compute drops absent signals and renormalises the remaining weights (cross_functional.ts:162-170), so partial data never silently corrupts a score.
- The deterministic narrative chain is coherent and testable end-to-end: per-domain watch-outs roll up into a single severity-ranked, owner-tagged action plan (newsletter.ts:194-211), an exec brief with headline KPIs/wins/risks (newsletter.ts:230-247), and a Markdown facts pack (factsPack.ts) — pure data, no DOM, no LLM, fully reproducible.
- Cross-functional join logic is the most analytically ambitious piece and mostly thoughtful: keys on employee_number, gates departments at MIN_DEPT_ACTIVE=8 to avoid small-n noise (cross_functional.ts:29,72), derives replacement cost from real TA cost/joined with a 2-month payroll proxy fallback (estimateReplacementCost, cross_functional.ts:323-345), and flags regrettable (high-performer/high-potential) exits (regrettableExits, cross_functional.ts:370-410).

**Gaps**
- The forecast is not a predictive model and its uncertainty band is mislabeled. forecastWorkforce (movement.ts:117-140) is a recency-weighted average + linear OLS slope on the last 6 months; the 'lower/upper' band is a hardcoded joiners±10% / leavers∓10% flex (movement.ts:135-136) with NO statistical basis, yet the KPI/table call it a 'range' and the test names it a 'confidence band' (movement.test.ts:49). No prediction intervals, no seasonality, no holdout/backtest, and linear slope extrapolation of net flow is unstable over a 6-month horizon.
- No statistical rigor: the entire metrics layer uses means only — avg tenure (people.ts:84,159), avg rating (pms.ts:40), avg span (people.ts:296) — with no medians, percentiles, distribution/dispersion, outlier handling, or any significance testing. A grep for median/percentile/variance/regression/cohort/survival/confidence across src/core/metrics returns nothing (the only 'confidence' is filename period-parsing in ingest/period.ts).
- No benchmarking or configurable targets. Every threshold is a hardcoded literal: annualised attrition ≥0.2/0.3 (movement.ts:214-216), early-tenure concentration ≥0.45/0.6 (people.ts:189), female-share <12% (people.ts:239), span ≥15 (people.ts:297), compound-risk score ≥50/65 (cross_functional.ts:202,244), and win rules at 70/90/60/98% (newsletter.ts:83-90). There are no industry/peer benchmarks and no org-specific or branding-driven target overrides — 'good/bad' is the author's fixed opinion.
- Attrition methodology is simplistic and potentially misleading. annualisedAttrition = (totalLeavers/months)*12/currentActive (movement.ts:172) uses CURRENT active as the denominator (not average headcount), ignores seasonality, and with a single month of movement annualises one month ×12 with no small-sample caveat — easily over/under-stated. No voluntary-vs-involuntary split, no rolling-12m actual, no manager/tenure-cohort attrition curves.
- The cross-functional 'risk score' is relative, not absolute, and unstable. normalise() (cross_functional.ts:310-321) min-max scales each signal ACROSS ONLY the current snapshot's eligible departments, so a '65/100' is meaningful only within this org/period, is not comparable across companies or months, and returns 0 for every department when a signal's spread is < 1e-9 (e.g. all-equal or one eligible dept). Weights (0.35/0.2/0.2/0.25, cross_functional.ts:28) are arbitrary and unjustified.
- No scenario planning or driver analysis beyond the single ±10% flex. There is no what-if (e.g. hiring-plan vs budget variance — target_join_date/headcount-plan fields exist in datasets.ts:93,309 but are not modeled), no sensitivity analysis, no attrition-driver attribution, and the regrettable-attrition/economics features depend on optional leaverEvents that the TS layer notes are not yet wired from the events model (cross_functional.ts:14-17).

**Scalability notes**
- Analytics are recomputed per render from in-memory rows with O(n) scans and Map aggregations (people.ts, cross_functional.ts) — fine for typical SMB employee files but unmemoised; large multi-snapshot histories or 100k+ row directories will recompute on every filter/period change.
- The directory is hard-capped at 1000 rows (people.ts:426) and most tables top-N (12–20) — pragmatic for a single-file offline app, but means analysis is implicitly truncated for very large orgs unless exported.
- Cross-functional joins build per-call Maps over every domain's rows on each compute (cross_functional.ts:65-159); with many snapshots/datasets this is repeated work that would benefit from memoisation keyed on snapshot ids.

**Recommendations**
- Rename and reframe the forecast honestly: stop calling the ±10% flex a 'confidence band' in code/tests (movement.ts:114, movement.test.ts:49). Either implement real uncertainty (e.g. residual-based prediction intervals from a backtest, or simple bootstrap of monthly net flow) or relabel it explicitly as a deterministic scenario band and document the assumption.
- Add distribution-aware statistics: report median and p25/p75 (and a spread/IQR) alongside means for tenure, rating, and span; this is low-effort, fits the pure-function design, and materially improves credibility for skewed HR distributions.
- Make thresholds and targets configurable per tenant: lift the hardcoded literals (attrition 0.2/0.3, early-tenure 0.45, female 12%, span 15, risk 50/65, win 70/90/60/98) into a typed, branding/settings-driven config with sensible India-context defaults, so customers can set their own targets and (optionally) paste peer benchmarks.
- Fix attrition math and add a rolling actual: use average headcount (begin+end)/2 as the denominator, expose a true trailing-12-month attrition once enough snapshots exist, and suppress/flag annualisation when months < 3 to avoid one-month ×12 distortion (movement.ts:172).
- Make the compound-risk score absolute and stable: replace per-snapshot min-max normalisation with fixed, documented anchor scales per signal (or percentile-against-config-target), so scores are comparable across orgs and over time and don't collapse to 0 on tight spreads (cross_functional.ts:310-321); justify or expose the signal weights.
- Introduce real scenario planning by wiring the existing plan fields: model hiring-vs-plan and cost-vs-budget variance from target_join_date/headcount-budget (datasets.ts), and add tenure/manager cohort attrition curves (cohort or simple survival) to move from descriptive to genuinely predictive people analytics.

**Files cited:** D:/Claude Local/HR-Analytics-repo/src/core/metrics/movement.ts, D:/Claude Local/HR-Analytics-repo/src/core/metrics/movement.test.ts, D:/Claude Local/HR-Analytics-repo/src/core/metrics/people.ts, D:/Claude Local/HR-Analytics-repo/src/core/metrics/cross_functional.ts, D:/Claude Local/HR-Analytics-repo/src/core/metrics/base.ts, D:/Claude Local/HR-Analytics-repo/src/core/metrics/compare.ts, D:/Claude Local/HR-Analytics-repo/src/core/metrics/talent_acquisition.ts, D:/Claude Local/HR-Analytics-repo/src/core/metrics/pms.ts, D:/Claude Local/HR-Analytics-repo/src/core/narrative.ts, D:/Claude Local/HR-Analytics-repo/src/reports/newsletter.ts, D:/Claude Local/HR-Analytics-repo/src/reports/factsPack.ts, D:/Claude Local/HR-Analytics-repo/src/core/datasets.ts

---

### Enterprise-readiness gaps — enterprise readiness 1/5

Airpay HR Analytics is a deliberately offline, single-file React/TS app (one dist/index.html, no server, no network). Its enterprise posture is intentionally minimal: there is NO authentication, NO multi-user/RBAC, NO audit trail, NO real persistence beyond a user-saved gzipped JSON workspace, NO HRIS/ATS connectors, NO i18n, and effectively no accessibility instrumentation (only ~7 aria/role/alt attributes across the whole UI). The design spec (docs/superpowers/specs/2026-05-30-browser-hr-analytics-design.md) is explicit that this is 'Phase A' and that auth, multi-tenancy, billing, and compliance are deferred to an unbuilt 'Phase B'. README.md states 'There is no authentication layer by design' and the security model is literally 'whoever holds the file holds the data' (Excel-file trust model). The privacy-first/offline stance is a genuine strength for security-conscious buyers who fear cloud HR data, but it is simultaneously the binding constraint that blocks most enterprise procurement checklists. For THIS area, the product is a polished single-user prototype, not enterprise-grade software. Score: 1/5.

**Strengths**
- Privacy-by-architecture is a real, defensible selling point: src/workspace/workspace.ts + src/ui/AppShell.tsx confirm data only enters via FileReader and only leaves via a Blob download the user triggers; grep for fetch/XMLHttpRequest/WebSocket/sendBeacon across src returned ZERO matches, so 'PII never leaves the tab' is verifiably true.
- Zero-infrastructure deployment sidesteps a whole class of enterprise objections: dist is one self-contained HTML hostable on SharePoint/any static host (README.md lines 11-17, 50-62) with no server, DB, installer, or native binary to security-review or patch.
- Clean separation between a pure, framework-agnostic analytics engine (src/core/metrics/*) and UI means the engine 'can be reused server-side without a rewrite' (design spec lines 22-24) — a credible migration path toward a real multi-tenant backend.
- Deterministic, rule-based narrative (no LLM/AI; README.md line 33) removes AI-governance, model-risk, and data-egress-to-LLM concerns that increasingly block enterprise procurement.
- Branding/white-label is genuinely implemented (src/branding/branding.ts, src/ui/pages/Branding.tsx: theme export/import, hex validation, presets, logo data-URI), which covers the cosmetic side of enterprise reseller/OEM needs.

**Gaps**
- No authentication or SSO of any kind: grep for auth/login/sso/saml/oauth/oidc/jwt across src returns no matches; README.md line 117 and design spec lines 48 & 122 confirm 'no authentication layer by design'. Enterprises cannot satisfy SAML/SCIM/MFA mandates.
- No multi-user, no RBAC, no multi-tenancy: src/ui/state.tsx is a single React context with one MemoryStore (src/core/store/memoryStore.ts) and no concept of users, roles, or permissions; multi-tenancy is explicitly 'Phase B, out of scope' (design spec lines 22, 38).
- No audit trail / activity logging: the only occurrences of 'audit' in src are narrative strings about HR compliance risk (metrics/ld.ts, metrics/talent_acquisition.ts), not access/change logging. There is no record of who loaded, viewed, edited, or exported data.
- No real persistence or scale story: state lives in an in-memory Map (memoryStore.ts) and a single gzipped JSON file saved manually (workspace.ts); grep confirms NO localStorage/IndexedDB/server DB. All snapshots load into browser RAM at once, so large headcounts/many months are bounded by tab memory, and a closed tab with an unsaved workspace loses everything.
- No HRIS/ATS integrations or connectors: the only ingestion path is manual .xlsx upload matched by filename date (parseWorkbook.ts, DataIntake.tsx); no Workday/SuccessFactors/SAP/BambooHR/Greenhouse/Lever/API/webhook code exists anywhere in src.
- No data governance controls: src/core/ingest/parseWorkbook.ts coerces columns and uploads flow straight into store.add() (DataIntake.tsx) with no retention policy, field-level redaction/masking, consent tracking, encryption, or integrity check — the workspace .gz is plaintext gzip, not encrypted, despite carrying full employee PII (a real PII file sits in gitignored private/Airpay-real-employee-workspace.json.gz).
- Accessibility (WCAG) is effectively unaddressed: only ~7 aria/role/alt/htmlFor attributes exist across the entire src tree; navigation in AppShell.tsx uses href='#' anchors as buttons, color is set via brand hex with no contrast validation, and there is no keyboard-nav/focus-management or screen-reader audit — would fail a WCAG 2.1 AA review.
- No i18n/L10n, no security certifications, no admin tooling, and no engineering governance: zero i18n/locale code (strings hardcoded, India-only INR/en-IN formatting); no SOC2/ISO 27001/GDPR artifacts; no SECURITY.md, no CI workflow (.github absent), no dependabot, no lint config; testing relies on ad-hoc verify*.cjs scripts and version is still 0.1.0 in package.json.

**Scalability notes**
- All data is held in a single in-memory Map (src/core/store/memoryStore.ts) and every metric recomputes over store.allSnapshots(); the entire multi-month, multi-domain dataset must fit in one browser tab's heap, so scale ceiling = client RAM, not a database.
- Persistence is a single monolithic gzipped JSON blob saved/loaded in one shot (workspace.ts, AppShell.onSave/onLoad) — there is no incremental sync, no concurrency, and no partial load, so workspaces grow unbounded and a large org's history becomes a heavy single file.
- No concurrency or multi-user access model: state is one React context (state.tsx); two people cannot collaborate, and there is no locking, conflict resolution, or shared source of truth — each user has an independent file copy.
- Single-region/single-locale assumptions are baked in (en-IN / INR formatting, India context) with no i18n layer, limiting multi-geography enterprise rollout without code changes.

**Recommendations**
- Reframe the sale honestly by segment: position the current single-file app as a privacy-first, air-gapped DESKTOP/share tool for SMB or security-paranoid teams, and do NOT pitch it against cloud HRIS suites on enterprise RFP checklists (auth/RBAC/audit/SSO) it structurally cannot pass today.
- If enterprise is the target, fund the 'Phase B' backend the spec already anticipates (design spec lines 22-24): wrap the pure engine in src/core/metrics/* behind a server with SSO/SAML+SCIM, RBAC, per-tenant isolation, an append-only audit log, and encrypted persistence — the engine is already framework-agnostic, so this is additive, not a rewrite.
- Add an interim hardening layer that fits the offline model: optional passphrase-based encryption of the .json.gz workspace (workspace.ts), a workspace integrity/version checksum, and a local action log embedded in the workspace — closes the most glaring 'plaintext PII file' and 'no audit' objections without a server.
- Close the accessibility gap before any enterprise/government deal: run a WCAG 2.1 AA pass on src/ui (replace href='#' nav with buttons, add aria labels/roles/focus management, validate brand-color contrast in branding.ts), since accessibility is a hard procurement gate for many enterprises and the public sector.
- Build at least one real connector and a data-governance surface: a Workday/SuccessFactors or SFTP/API import path beyond manual xlsx (parseWorkbook.ts), plus in-app retention/redaction/consent controls, to answer the 'how does data get in at scale and how is it governed' question.
- Add baseline engineering governance to signal maturity to enterprise security review: a real test runner + CI (.github/workflows), dependency scanning (dependabot/Snyk), a SECURITY.md and disclosure process, lint config, and a credible versioning/release cadence (currently 0.1.0 with ad-hoc verify*.cjs harnesses).
- Produce a security/compliance whitepaper and SBOM that leans INTO the offline posture (no data egress, no server attack surface, deterministic no-AI) as a differentiator, while transparently listing the gaps (no SOC2/ISO yet) so security teams can self-assess rather than disqualify on silence.

**Files cited:** D:\Claude Local\HR-Analytics-repo\README.md, D:\Claude Local\HR-Analytics-repo\package.json, D:\Claude Local\HR-Analytics-repo\.gitignore, D:\Claude Local\HR-Analytics-repo\src\App.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\state.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\AppShell.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\pages\Branding.tsx, D:\Claude Local\HR-Analytics-repo\src\ui\pages\DataIntake.tsx, D:\Claude Local\HR-Analytics-repo\src\workspace\workspace.ts, D:\Claude Local\HR-Analytics-repo\src\core\store\memoryStore.ts, D:\Claude Local\HR-Analytics-repo\src\core\ingest\parseWorkbook.ts, D:\Claude Local\HR-Analytics-repo\src\core\datasets.ts, D:\Claude Local\HR-Analytics-repo\src\branding\branding.ts, D:\Claude Local\HR-Analytics-repo\docs\superpowers\specs\2026-05-30-browser-hr-analytics-design.md, D:\Claude Local\HR-Analytics-repo\docs\reports-suite-plan.md, D:\Claude Local\HR-Analytics-repo\private\Airpay-real-employee-workspace.json.gz

---

## B. Competitive research

### Enterprise people-analytics & workforce-planning platform. Visier People is the category-leading dedicated people-analytics SaaS: a cloud-native, AI-augmented analytics layer that sits on top of an enterprise's HRIS/ATS/payroll/engagement systems. It unifies workforce data into a domain-specific model and serves prebuilt metrics, benchmarks, ML predictions, dashboards, and a GenAI assistant to CHROs, HRBPs, and line managers at mid-to-large organizations. — threat 2/5

Visier ingests data from HR systems (Workday, SAP SuccessFactors, Oracle HCM, ATS, payroll, engagement/collaboration tools) via no-code connectors and APIs into a proprietary, AI-ready people data model. On top of it, customers get 2,000+ prebuilt business metrics, hundreds of analyses across the employee lifecycle, ~250M anonymized benchmarks from a community dataset, ML-driven predictions (Risk of Exit, promotion, internal movement), workforce planning, and the "Vee" GenAI assistant that answers natural-language workforce questions. It targets large, complex enterprises and is sold modularly on per-employee/custom enterprise pricing.

**Key features**
- 2,000+ prebuilt, curated business metrics and hundreds of guided analyses spanning the full employee lifecycle (headcount, movement, retention, diversity, performance), well beyond our people-analytics coverage
- ~250M+ external benchmarks across North America, Europe, and Asia plus a community dataset of ~25M anonymized employee records — peer comparison we cannot offer offline
- ML predictive models: Risk of Exit early-warning, promotion likelihood, and internal-movement forecasting feeding workforce planning
- 'Vee' GenAI conversational assistant: natural-language Q&A grounded in the customer's own data model, claimed factual/no-hallucination, used by 2M+ users, embedded in Visier, Microsoft Teams, and Copilot
- Vee Boards (AI-augmented insight boards) and emerging agentic AI (e.g. a Manager Agent) that surface big-picture stories and automate manager tasks
- No-code data connectors + APIs/JDBC/SFTP to major HRIS/ATS/payroll/survey systems; embedded-analytics offering for SaaS vendors
- Interactive dashboards, drill-down visualizations, and configurable reports for executives and HRBPs

**Strengths**
- Category leadership and brand trust with large enterprises; deep, mature, opinionated metric/analysis library that would take years to replicate
- Unique data network effects: massive benchmark and community datasets give peer/industry context no single-tenant or offline tool can match
- Production-grade ML predictions and agentic AI (Vee, Vee Boards, Manager Agent) tied to a domain-specific model, with enterprise security and broad adoption (2M+ Vee users)
- Broad, no-code integration ecosystem and embedded-analytics channel that locks into enterprise HR stacks
- End-to-end scope (analytics + benchmarks + prediction + workforce planning + org design) positions it as a strategic CHRO platform, not just reporting

**Weaknesses**
- Expensive and enterprise-gated: ~$5/employee/month entry scaling to ~$20K/month for 100 users and custom six-figure deals for 1,000+ — far out of reach for SMBs and price-sensitive India-market buyers
- Long, heavy deployment: typically 8-16 weeks (6-8 weeks even for third-party connector integrations); requires data integration projects and ongoing data-engineering effort
- Cloud-only SaaS: workforce PII must be ingested into Visier's environment — a hard blocker for privacy-strict, air-gapped, or data-residency-constrained buyers
- Reliance on LLM/GenAI (Vee) introduces the trust, security-review, and explainability concerns some HR/legal teams resist; mixed third-party ratings note cost and complexity (e.g. ITQlick ~5.2/10)
- Infrastructure- and admin-heavy: needs IT, data, and analyst resources to stand up and maintain — overkill for a single HR team wanting a fast monthly newsletter/report
- Overpowered for organizations that just need clean monthly people KPIs and a narrative brief without committing to a platform

**What we could do differently**
- Lead with radical privacy and zero-infrastructure: 100% offline, single-file browser app where PII never leaves the tab — the exact opposite of Visier's cloud ingestion; a clean wedge for India data-residency, security-averse, and air-gapped buyers
- Win on time-to-value and price: instant 'open the file and go' with no 8-16 week implementation, no per-employee SaaS fee, no data-engineering project — target SMBs and individual HR teams Visier prices out
- Own the deterministic, no-AI narrative as a feature, not a gap: a rule-based monthly HR Newsletter (CHRO brief + owner-tagged action plan) gives auditable, reproducible prose with zero hallucination risk and no LLM security review — directly answering enterprises wary of GenAI like Vee
- Embrace white-label/portability: rebrandable single dist/index.html that an HR consultancy or service provider can hand to many clients, versus Visier's locked enterprise tenancy
- Compete on simplicity for the 80% use case (headcount, tenure, diversity, attrition, pending exits, data quality, printable PDF) rather than chasing 2,000 metrics, benchmarks, or predictive ML — position as 'the analyst-in-a-file,' not a platform migration
- Differentiate on cost-of-ownership messaging: no servers, no integrations to maintain, no admin overhead — a workspace JSON the user saves locally vs. a recurring enterprise contract

---

### Workday's analytics stack: (1) Workday People Analytics — an augmented-analytics app embedded in Workday HCM; (2) Workday Prism Analytics — a "click-not-code" data hub/ELT layer that blends external data with Workday objects, now extended by the Sept 2025 Workday Data Cloud (zero-copy sharing to Snowflake/Databricks/Salesforce via Apache Iceberg + Live Data Query SQL); and (3) Workday Illuminate — the AI/GenAI layer with purpose-built HR/Finance agents, monetized via Flex Credits. All three are deeply coupled to Workday as the system of record and inherit its tenant security model. — threat 2/5 · confidence: high

Turns Workday HCM/Finance data into insights and actions. People Analytics uses a "storyteller engine" (statistical model + pattern detection, graph processing, ML) to auto-discover insights and generate natural-language narratives, KPI/trend stories, and emailed executive summaries — now powered by Illuminate. It ships curated topics: diversity/inclusion (VIBE Index), org composition, retention/attrition, talent/performance, hiring, and skills, with drill-down to top drivers and period-over-period trends. Prism Analytics is the data-engineering layer: ingest external data (API, SFTP, browser upload, S3/Iceberg connectors), transform via drag-and-drop joins/unions/group-by/filters, and blend it with Workday Business Objects under Workday governance. Illuminate adds agentic AI that executes HR/Finance work (performance reviews, workforce planning, case management, business-process setup), priced through Flex Credits.

**Key features**
- People Analytics 'storyteller engine': ML/graph-processing auto-insight discovery across millions of combinations, with NL narratives, KPI stories, and emailed exec digests
- Curated people topics out of the box: attrition/retention, org composition, talent/performance, hiring, skills, and VIBE Index diversity scoring
- Illuminate AI agents (HR/Finance): performance reviews, workforce planning, case management, business-process copilot; sold via consumption-based Flex Credits
- Prism Analytics data hub: 'click-not-code' ELT to ingest (API/SFTP/upload/S3) and transform external data, blended with Workday objects in one catalog
- Workday Data Cloud (Sept 2025): zero-copy two-way sharing to Snowflake/Databricks/Salesforce via Apache Iceberg, plus Live Data Query direct SQL access
- Inherits Workday's tenant security/compliance model so insights scale to every org level natively in-app and via email

**Strengths**
- System-of-record advantage: clean, governed, real-time HCM data with no integration tax — analytics and security are native to the Workday tenant
- Augmented analytics genuinely automates insight discovery and narrative generation at enterprise scale; standardized metric definitions kill 'multiple interpretations' debates
- Illuminate moves beyond dashboards to agentic action (it runs the review cycle / workforce plan), which a read-only analytics tool cannot match
- Massive enterprise install base, executive trust, and analyst momentum (positioned as evolving from system-of-record to 'platform of agents')
- Data Cloud + Live Data Query opens Workday data to external lakehouses/BI, neutralizing the old 'walled garden' complaint for data teams
- Built-in compliance, audit, and global scale that large regulated enterprises require

**Weaknesses**
- Useless without Workday as system of record — for non-Workday shops (or multi-HRIS estates) People Analytics/Illuminate simply don't apply; insights are confined to Workday-resident data
- Enterprise cost and complexity: opaque custom pricing, employee-count + module + Flex-Credit consumption billing; implementations run 4-6 months (mid) to 9-18 months (large)
- Cloud/SaaS by design — data leaves the customer's premises into Workday's cloud (and now into Snowflake/Databricks); a non-starter for privacy-/air-gap-sensitive or data-residency-strict buyers
- AI-first and non-deterministic: Illuminate narratives/agents are probabilistic ML output, raising explainability, auditability, and trust concerns for some HR/legal teams
- Heavy adoption burden — complex UI needs structured training; support/resourcing during rollout is a recurring complaint
- Overkill and unaffordable for SMBs and India mid-market; no free/portable/self-serve tier, and pricing/UX assume large global enterprises

**Pricing model:** Enterprise-only, quote-based. No free tier or public list price. Subscription scales with employee count, modules deployed, data volume, and use-case complexity; Prism adds fees driven by data volume/use cases. Illuminate AI is monetized via 'Flex Credits' — a consumption-based credit pool included in subscriptions and applied across agents. Total cost is high and accompanied by multi-month implementation/services spend.

**Target segment:** Large and global enterprises already standardized on Workday HCM/Financials — CHROs, HR analytics leaders, and C-suite needing governed, in-app workforce insight and (via Illuminate) agentic automation. Not aimed at SMBs, non-Workday organizations, or privacy/air-gap-constrained buyers.

**Notable capabilities**
- Auto-generated natural-language narratives and emailed executive summaries from a statistical 'storyteller' engine (now Illuminate-powered)
- Agentic AI (Illuminate) that performs HR work end-to-end — performance reviews, workforce planning, case management, business-process configuration
- Workday Data Cloud zero-copy, two-way data sharing to Snowflake/Databricks/Salesforce via Apache Iceberg, plus Live Data Query direct SQL
- Prism 'click-not-code' ELT pipelines to blend external datasets with Workday Business Objects under unified security/governance
- VIBE Index for standardized diversity, inclusion, and belonging measurement

**What we could do differently**
- Lead hard on 'no system-of-record required': we run on any CSV/employee-master export, so non-Workday and multi-HRIS shops get instant people analytics Workday structurally cannot serve
- Own the privacy/sovereignty wedge: fully offline, single-file, PII-never-leaves-the-tab — the polar opposite of Workday's cloud + Data Cloud zero-copy-to-Snowflake model; ideal for data-residency-strict and air-gapped Indian buyers
- Make 'deterministic, no-AI' a trust feature: rule-based narratives are explainable, auditable, and repeatable — counter-positioning against Illuminate's probabilistic agents and Flex-Credit billing for HR/legal skeptics
- Compete on time-to-value and zero-infra: a self-contained dist/index.html that works in minutes vs. 4-18 month Workday implementations and procurement cycles
- Attack the cost/complexity gap with transparent, infra-free, white-label pricing for SMB/mid-market that Workday's per-employee + consumption model prices out
- Win on portability and white-labeling: a workspace that saves/loads as a gzipped file and re-brands per client — something a tenant-locked enterprise suite can't replicate for consultants/HR-services firms
- Borrow their best idea, deterministically: keep expanding the rule-based 'storyteller' newsletter (CHRO brief + owner-tagged actions) so we match the narrative/email-digest value prop without the AI or the lock-in

---

### SAP SuccessFactors and Oracle Fusion Cloud HCM — the workforce/people analytics modules inside the two largest enterprise HCM suites. SAP: legacy SuccessFactors Workforce Analytics (WFA, a managed HANA-based benchmark data warehouse) now being superseded (2025-26) by "People Intelligence" on SAP Business Data Cloud, with the Joule AI copilot. Oracle: Fusion HCM Analytics (prebuilt app on Fusion Data Intelligence / Fusion Analytics Warehouse, formerly FAW) plus OTBI (Oracle Transactional BI) for self-service reporting. Both are cloud-only SaaS add-ons that require the vendor's HCM suite as the system of record. — threat 2/5 · confidence: high

Both deliver enterprise workforce analytics on top of their HCM systems of record — prebuilt KPI libraries, governed dashboards, self-service reporting, and increasingly AI/predictive layers (attrition risk, forecasting, NL querying via copilots), all cloud-hosted in the vendor's data warehouse.

**Key features**
- Hundreds-to-thousands of prebuilt best-practice HR KPIs and governed dashboards (Oracle markets 1,000+; SAP WFA ships curated metric packs with external benchmarking)
- Managed cloud data warehouse as the analytics engine (SAP HANA/Business Data Cloud; Oracle Fusion Data Intelligence on OCI) — heavy ETL/BICC pipelines, no offline/local mode
- AI/predictive layer is now the headline: attrition/flight-risk prediction, labor-cost and workforce forecasting, skills-gap mapping, scenario simulators
- Natural-language analytics via copilots (SAP Joule; Oracle embedded GenAI) — explicitly LLM/AI-driven, the opposite of a deterministic engine
- Self-service ad-hoc reporting (SAP Stories/Report Center; Oracle OTBI) plus BI-warehouse extensibility, but with a steep technical learning curve
- Deep native integration with the rest of the suite (payroll, recruiting, learning, performance) and with ERP/finance/supply-chain data

**Strengths**
- Breadth and depth at enterprise scale: thousands of curated KPIs, cross-domain (HR + finance + ERP) data, multi-country, audited governance and security
- Native to the system of record — data is already live in the suite, so no separate import step for existing SAP/Oracle customers
- Heavy AI/ML investment in 2025-26 (SAP People Intelligence + Joule, Oracle embedded GenAI) for predictive attrition, forecasting, NL querying — strong analyst/marketing narrative
- Vendor benchmarking data and best-practice metric definitions out of the box (especially SAP WFA's external benchmarks)
- Enterprise trust, compliance posture, global support, and analyst (Gartner/Forrester) leadership that de-risk the buying decision for large orgs

**Weaknesses**
- Cloud-mandatory and data leaves the tenant: everything runs in SAP/Oracle cloud warehouses — no offline mode, no single-file artifact, PII necessarily flows to vendor infra (the opposite of our privacy-first stance)
- Severe lock-in: requires the underlying HCM suite as system of record; data extraction is brittle (Oracle BICC pipelines are 'slow, brittle, hard to maintain'); switching cost is enormous
- High complexity and long time-to-value: WFA implementations run ~100 days to 12+ months, need specialized consultants/IT, complex data modeling, and steep learning curves that limit true self-service
- Enterprise-only economics: SAP PEPM ~$28-38 for full suite with $100K-$2M+ implementation; Oracle imposes a 1,000-license minimum (~$180K/yr floor) plus separate analytics/warehouse spend — far out of reach for SMB/mid-market
- Data-coverage and integration gaps even within the suite: SAP WFA historically lacked access to some core areas (e.g., learning, payroll), struggled joining data, and couldn't easily ingest external sources
- AI-first direction means non-deterministic outputs (LLM copilots can hedge/hallucinate); buyers wanting reproducible, auditable, rule-based numbers get probabilistic answers
- Newest capabilities (SAP People Intelligence) require an additional platform layer (SAP Business Data Cloud), adding cost, migration effort, and another dependency on top of SuccessFactors

**Pricing model:** Enterprise SaaS, subscription, per-employee-per-month (PEPM), no public list pricing — all negotiated. SAP SuccessFactors full suite ~$28-38 PEPM at enterprise scale (modules $6-38 PEPM range), with implementation $100K-$500K mid-market and $2M+ for multi-country enterprise; WFA/People Intelligence are paid add-ons (People Intelligence further requires SAP Business Data Cloud). Oracle Fusion Cloud HCM enforces a 1,000-user license minimum (~$180K/yr floor at list), roughly $18-30 PEPM depending on modules, with Fusion HCM Analytics / Fusion Data Intelligence (on OCI) and OTBI as separate analytics spend. Both exclude implementation, integration, and analytics-warehouse services from the base subscription.

**Target segment:** Large and global enterprises (typically 1,000+ employees; Oracle's hard floor is 1,000 licenses, SAP's economics target 5,000+ for negotiated suite rates) that have already standardized on the respective HCM suite as their HRIS system of record. Buyers are enterprise CHRO/CIO/HRIS teams with dedicated IT, consultant budgets, and multi-year SaaS commitments. Not aimed at SMB or mid-market, and not at organizations needing offline, portable, or self-service-in-minutes analytics.

**Notable capabilities**
- SAP People Intelligence (2025-26, on SAP Business Data Cloud) with Joule AI copilot: natural-language workforce Q&A, predictive attrition/flight-risk, labor-cost and headcount forecasting, skills-gap mapping, and what-if scenario simulators across HR + finance data
- Oracle Fusion HCM Analytics: 1,000+ best-practice prebuilt HCM KPIs on Fusion Data Intelligence with embedded GenAI for attrition/retention insight, plus OTBI for self-service transactional reporting
- SAP SuccessFactors Workforce Analytics (legacy): managed HANA benchmark warehouse with curated metric packs and external industry benchmarking (being superseded by People Intelligence)
- Deep cross-suite and ERP/finance integration (payroll, recruiting, learning, performance, spend) enabling enterprise-wide, real-time, governed analytics
- Enterprise governance, security, compliance, and global support backing the analytics — the trust layer large regulated orgs require

**What we could do differently**
- Lean hard into offline + privacy-first: a single self-contained dist/index.html where PII never leaves the tab is structurally impossible for SAP/Oracle cloud warehouses — sell to security/compliance-sensitive, air-gapped, or India-data-residency buyers who can't or won't ship HR data to a US cloud
- Zero-infra, minutes-to-value vs their 100-day-to-year implementations and consultant dependency: position as 'open the file, load a CSV, get the CHRO newsletter today' with no IT project, no data warehouse, no PEPM contract
- Own 'deterministic, no-AI' as a feature, not a gap: while SAP/Oracle push LLM copilots (Joule) that hedge and can hallucinate, market reproducible, auditable, rule-based narratives and numbers a CHRO can defend in a board meeting
- Attack the price floor: they're economically unreachable below ~1,000 employees (Oracle's hard minimum, SAP's six-figure TCO) — target Indian SMB/mid-market with INR-native formatting, Indian number grouping, and a portable license, a segment the suites actively price out
- No-suite-required + white-label: we don't require SuccessFactors/Oracle as system of record and we re-brand for partners — pitch to HR consultancies, PEOs, and multi-client advisors who need a portable, brandable monthly analytics + newsletter deliverable per client
- Portability as the moat: a gzipped workspace file the user saves/loads/emails is a fundamentally different ownership model than a locked SaaS tenant — emphasize data sovereignty, no vendor lock-in, and works-forever-offline against their extraction/exit friction

---

### Microsoft's HR/people-analytics stack: (1) Viva Glint — cloud employee-engagement/listening surveys; (2) Viva Insights — passive Microsoft 365 collaboration telemetry, now bundled into the M365 Copilot license; (3) Power BI HR — bring-your-own report templates (AppSource/third-party) for headcount, attrition, diversity, and payroll dashboards. Together they form a broad Microsoft-stack approach to workforce analytics, but each piece solves a different slice and all are cloud/SaaS, license-gated, and tied to the Microsoft 365/Azure ecosystem. — threat 3/5 · confidence: high

Viva Glint runs pulse/lifecycle/exit/onboarding/360/DEI engagement surveys, summarizes free-text comments via AI/NLP, shows heatmaps and engagement drivers, and flags populations at elevated attrition risk; it is provisioned per M365 tenant (Entra ID, 50-seat minimum) and needs HRIS employee attributes uploaded to slice results. Viva Insights derives wellbeing/productivity and collaboration-pattern metrics from M365 signals (meetings, focus time, after-hours, and Copilot adoption), de-identified with a minimum group size of five. Power BI HR is a self-built BI capability: HR teams import HRIS/payroll data into Power BI Desktop, model it, and publish dashboards (headcount movement, voluntary/involuntary attrition, tenure, gender/diversity, payroll cost) to the cloud Power BI service, requiring Pro/Premium licensing, a data gateway, and scheduled refresh. None of the three ships a deterministic, prose HR newsletter; insight-to-narrative is manual or, in Viva, AI-generated.

**Key features**
- Viva Glint: engagement/lifecycle/exit/360/DEI surveys with AI comment summarization, heatmaps, driver analysis, and manager guided-conversation reports
- Viva Glint: predictive attrition-risk notifications and internal/external (industry) benchmark comparisons
- Viva Insights: passive collaboration-pattern analytics from M365 telemetry (meetings, focus, after-hours, Copilot adoption) with de-identification and min group size 5
- Power BI HR: third-party/AppSource report templates covering headcount, hires/terminations, attrition (voluntary vs involuntary), tenure, diversity, and payroll cost
- Power BI: full custom modeling, DAX, drill-down, and scheduled cloud refresh via on-prem data gateway
- Glint + Insights integration ('Workplace Patterns') to combine active listening with passive signals
- Deep Microsoft 365 / Teams / Entra / Azure ecosystem integration and SSO
- Enterprise-grade scale, role-based access, and Microsoft FastTrack/partner deployment support

**Strengths**
- Massive distribution and default-incumbent status inside any Microsoft 365 / Copilot shop (Viva Insights now bundled with the Copilot license)
- Viva Glint is a credible, people-science-backed engagement-listening platform with AI text analytics and benchmarks we do not attempt
- Power BI is an extremely powerful, flexible BI engine with a huge template/partner ecosystem and live data refresh
- Combines passive behavioral signals (Insights) with active survey listening (Glint) for an experience story we cannot collect offline
- Enterprise trust, security/compliance posture, SSO, and FastTrack/partner implementation muscle
- Continuous cloud data refresh and real-time dashboards vs our manual monthly snapshots

**Weaknesses**
- Fragmented: no single tool gives headcount+attrition+diversity+payroll AND engagement; buyers must stitch Glint + Insights + Power BI (and an HRIS) together
- Power BI HR analytics is DIY — buyers supply data, build the model, manage gateways/refresh, and design every dashboard; nothing turns numbers into a written narrative
- Cloud-only and license-gated: M365/Entra tenant, 50-seat minimums, Pro/Premium capacity, annual commitments — heavy infra and cost, no truly offline mode
- Privacy-sensitive by design: Viva Insights/Copilot telemetry invites employee-surveillance pushback; de-identification reduces but does not eliminate re-identification risk; PII lives in the cloud
- Not white-label or single-file portable — it is unmistakably Microsoft-branded and tenant-bound
- No deterministic, rule-based narrative / auto-generated CHRO newsletter; insight synthesis is manual or AI (non-deterministic, auditability concerns)
- Weak fit for India SMB/mid-market context (INR/Indian number grouping, no-IT, no-cloud buyers); setup and admin overhead is high
- Viva Glint requires HRIS attribute integration to be useful and is fundamentally survey-first rather than full operational people analytics

**Pricing model:** Subscription, per-user-per-month, annual commitment, on top of a required Microsoft 365 license. Viva Glint standalone ~$2/user/mo (50-seat minimum); Viva Insights ~$4/user/mo standalone and now included in the Microsoft 365 Copilot license; the 'Workplace Analytics and Employee Feedback' bundle (Insights+Glint+Pulse) ~$6/user/mo; full Viva Suite ~$12/user/mo. Power BI is separately licensed (Pro ~per-user or Premium/Fabric capacity) and HR templates are bought/built on top. Total cost of the Microsoft people-analytics stack is high and recurring vs our one-file, no-seat-minimum offline model.

**Target segment:** Mid-to-large enterprises already standardized on Microsoft 365/Azure with dedicated IT and BI teams; Viva Glint for engagement-listening programs, Viva Insights for M365 Copilot/productivity-driven orgs, Power BI for HR/People-analytics analysts who build their own dashboards. Poor fit for SMB, non-Microsoft, no-cloud, or privacy-constrained buyers.

**Notable capabilities**
- AI/NLP summarization of thousands of open-text survey comments (Viva Glint)
- Passive collaboration-pattern analytics and Copilot adoption benchmarking from M365 telemetry (Viva Insights)
- Predictive attrition-risk flagging and external industry benchmarks (Viva Glint)
- Fully customizable Power BI dashboards with DAX, drill-down, and scheduled cloud data refresh
- Glint + Insights 'Workplace Patterns' integration blending active and passive employee-experience signals

**What we could do differently**
- Lead on zero-infra + privacy: 'people analytics with no cloud, no tenant, no data gateway, PII never leaves the tab' directly answers the surveillance/IT-overhead objections to the Viva/Power BI stack
- Position as the deterministic, auditable alternative to AI narratives: our rule-based CHRO newsletter is explainable and reproducible — pitch this where Copilot/Glint AI summaries raise trust/compliance flags
- Own the unified single-file story: one portable dist/index.html delivers headcount+attrition+diversity+geography+org+data-quality+narrative, vs assembling Glint + Insights + Power BI + an HRIS
- Target the non-Microsoft / SMB / India mid-market that will never license M365 E5 + Copilot + Power BI Premium; emphasize INR formatting, Indian number grouping, and instant setup
- Sell white-label/embeddable to HR consultancies and payroll/HRIS vendors who cannot resell Microsoft-branded Viva
- Undercut on time-to-value and cost: load a CSV and get KPIs + charts + a written brief in minutes with no admin, no per-seat minimum, no annual commitment
- Add lightweight, offline survey/eNPS import (CSV) so we can narrate engagement alongside operational metrics — closing Glint's one clear edge without becoming a cloud listening platform
- Make 'export to Power BI / hand IT a clean dataset' a feature, not a competitor — interop lets us win the analyst while they keep their BI stack

---

### Two dedicated, enterprise/upmarket people-analytics SaaS platforms researched as a pair: One Model (Austin, TX) and Crunchr (Amsterdam, NL). Both unify multi-source HR data into a governed model and sell prebuilt metrics + data storytelling + forecasting. Researched via web (2025-2026 sources): vendor sites, software directories, and a vendor-comparison page. — threat 2/5 · confidence: medium

Both ingest, clean and consolidate data from many HR/business systems (HRIS, ATS, payroll, performance, engagement, finance) into a single governed people-data model, then expose prebuilt KPIs, self-service dashboards/storyboards, benchmarking, forecasting, and (in both) a generative-AI natural-language assistant. One Model leans toward a configurable enterprise data platform (Data Mesh ingestion, native SQL, entity-relationship modeling, version control, One AI assistant + MCP connectors to Copilot/ChatGPT) for analytics teams. Crunchr leans toward fast-to-deploy, business-user-friendly self-service (hundreds of out-of-the-box metrics across the full employee lifecycle, click-to-drill, role-based access, ~2-4 week implementation).

**Key features**
- Multi-source data integration into a governed HR data model (HRIS, ATS, payroll, performance, engagement, finance)
- Prebuilt metric libraries across the full lifecycle: headcount/org, hiring, turnover, diversity, internal mobility, performance, comp, absence, skills
- Data storytelling: customizable dashboards/Storyboards (One Model) and guided 'click-to-drill' insights with benchmarks (Crunchr)
- Workforce forecasting/predictive: hiring, attrition, capacity and cost planning so HR and finance plan together
- Generative-AI natural-language assistant in both (One AI Assistant; Crunchr NLQ) for ad-hoc questions
- One Model: native SQL exploration, ER diagrams, version control, test mode, MCP connectors to Copilot/ChatGPT
- Crunchr: rapid ~2-4 week deployment, self-service for HRBPs/managers with role-based security, benchmarking

**Strengths**
- Solve the hard, real problem of unifying messy multi-system HR data into one trustworthy governed model — the part the Airpay tool does not attempt
- Deep prebuilt-metric and benchmarking coverage across the entire employee lifecycle, validated at enterprise scale
- Continuous live pipelines and refreshes vs. a manual monthly snapshot upload
- Forecasting/predictive analytics tied to workforce cost and finance planning
- Conversational/generative-AI exploration lowers the analyst barrier for non-technical users
- Enterprise governance: role-based access, ISO/security certifications, multi-user collaboration (One Model), cloud scale and vendor support

**Weaknesses**
- Cloud-only SaaS: PII must leave the org's tab and sit in the vendor's cloud — a hard blocker for privacy-sensitive, air-gapped, or data-residency-constrained buyers
- Opaque, high custom enterprise pricing (One Model est. ~$30K-$150K+/yr; Crunchr undisclosed custom) — out of reach for SMB/single-team budgets
- Implementation projects (weeks) plus data-engineering/integration effort; not instantly usable
- Generative-AI assistants introduce LLM non-determinism and AI-governance concerns; not a deterministic, auditable narrative
- Heavier footprint: accounts, infrastructure, vendor lock-in, ongoing subscription vs. a portable single file
- India-context niceties (INR / lakh-crore grouping) not a stated focus; built for global enterprise

**Pricing model:** Both use custom, quote-only enterprise SaaS subscription pricing (no public price list). One Model is estimated by a third-party comparison at roughly $30,000-$150,000+ per year (consumption- or feature-tier based); Crunchr pricing is undisclosed and sales-quoted. Typically annual contracts, scaled by employee/headcount and modules. (Exact figures are third-party estimates - low confidence on dollar amounts.)

**Target segment:** Mid-market through large global enterprise HR/people-analytics functions. Buyers/users: CHROs, people-analytics leaders, HRBPs, HRIS teams, CFO/finance partners. One Model skews to organizations with dedicated analytics teams and complex data; Crunchr skews to 'people-first' orgs wanting fast, self-service business-user access (clients incl. Booking, Randstad, Arcadis). Both target a higher, better-resourced segment than Airpay's SMB/single-team/offline niche.

**Notable capabilities**
- One Model One AI Assistant + One AI Data Intelligence (AI-assisted onboarding); MCP connectors exposing governed data to Copilot/ChatGPT
- One Model data-modeling depth: native SQL, entity-relationship diagrams, version control, test-before-commit
- Crunchr ~2-4 week implementation with hundreds of out-of-the-box lifecycle metrics and benchmarking
- Both: transparent workforce forecasting (hiring/attrition/capacity/cost) bridging HR and finance
- Crunchr generative-AI NLQ assistant for instant plain-language answers; role-based self-service for managers/HRBPs

**What we could do differently**
- Lead hard on offline + privacy-first: zero PII egress, fully in-tab, air-gap-friendly — the exact thing both clouds cannot offer to regulated/sensitive buyers
- Position deterministic, rule-based narrative as auditable and AI-governance-safe vs. their LLM assistants (no hallucination, fully reproducible, no AI-policy approval needed)
- Win on time-to-value and zero-infra: open a single dist/index.html and analyze today — no 2-8 week implementation, no integrations, no accounts
- Attack the price umbrella: a free/low-cost single-file tool for SMBs, single HR teams, consultants, and pilots priced out of $30K-$150K platforms
- Own the India context: INR formatting and Indian number grouping out of the box, plus white-label resale to Indian SMBs/consultancies
- Make portability the pitch: a self-contained, emailable/USB-portable workspace file vs. cloud lock-in and vendor dependency
- Offer the deterministic monthly CHRO Newsletter (exec brief + owner-tagged action plan, print-to-PDF) as a concrete deliverable neither productizes the same way
- Frame as the privacy-safe 'last mile / pre-platform' tool: instant snapshot analysis and board-ready output before (or instead of) committing to a heavyweight platform

---

### ChartHop and Lattice are cloud-native, mid-market/enterprise people-ops + performance platforms. ChartHop is org-chart/people-data centric (HRIS, headcount planning, comp, org modeling) that has rebranded as "the HR platform built for AI." Lattice is performance/engagement centric ("people success": reviews, OKRs, surveys, 1:1s) with an analytics layer bolted on. Both overlap our people-analytics + org-chart surface, but neither is offline, deterministic, single-file, or India-first — they sit one tier up in price, infra, and scope. — threat 2/5 · confidence: high

Both are multi-tenant SaaS suites that sit on top of a company's HRIS/ATS and turn live people data into dashboards, org charts, and workflows. ChartHop ingests data via two-way syncs (ADP Workforce Now, Workday, BambooHR, Gusto, Greenhouse, Ashby, 15+ others) and renders real-time + future-dated org charts, headcount/comp planning sandboxes, and "board-ready" analytics, now fronted by a conversational ChartHop AI (launched Mar 2025). Lattice runs the performance/engagement cycle (custom reviews, 360s, calibration, nine-box, OKR goals surfaced in Slack/Jira/Salesforce, pulse surveys, recognition, 1:1s) and layers DEIB, adoption, team, and attrition-risk analytics on top, with AI-powered sentiment/recommendations. Both are per-employee-per-month, require integration + implementation, and keep all data in their cloud.

**Key features**
- ChartHop: live + future-dated org charts, restructure sandbox, open positions, cross-functional teams
- ChartHop: headcount planning, compensation review cycles, cascading Goals tied to live org/business data, two-way HRIS sync
- ChartHop AI (Mar 2025): natural-language filter bar + conversational Q&A over people+business data, form automation, org-change modeling
- Lattice: performance reviews, 360 feedback, calibration, nine-box talent review, OKR goals embedded in Slack/Jira/Salesforce
- Lattice: engagement/pulse surveys with AI sentiment, peer recognition, 1:1 agendas, Grow career framework
- Lattice Analytics: DEIB, adoption, team dashboards, attrition-risk modeling, cross-cycle performance trends, custom reports
- Both: cloud SaaS, deep HRIS/ATS integrations, per-employee-per-month pricing, vendor-hosted data

**Strengths**
- Breadth + workflow: not just analytics — they run the actual HR processes (reviews, comp cycles, headcount planning), creating stickiness we don't attempt
- Live, integrated data: native two-way HRIS/ATS sync means dashboards and org charts stay current with no manual upload
- ChartHop org modeling: real-time + future-dated org charts and restructure sandbox are genuinely strong and well-known
- Lattice performance depth: calibration, nine-box, 360s, OKR cascading embedded in daily tools (Slack/Jira) — far beyond our PMS demo generator
- Brand + market presence: both are established, well-funded category names with large customer bases and ecosystems
- Collaboration/scale: multi-user, role-based, real-time SaaS for distributed orgs — a fundamentally different use case than a single analyst's tab

**Weaknesses**
- Cloud-only, PII leaves the building: all employee data lives in the vendor's multi-tenant cloud — a hard blocker for privacy-strict, regulated, or India-data-residency buyers
- Infra + integration tax: useless until connected to an HRIS/ATS; implementation, admin, and onboarding overhead vs. our open-file-and-go
- Price floor + per-seat: ChartHop ~$8/emp/mo first module (+$4 each, $9k/yr min); Lattice from ~$10-11/user/mo, $4k/yr min — overkill cost for a single HR analyst or small org
- AI pivot vs. trust: both leaning hard into LLM/AI (ChartHop AI; Lattice's AI-sentiment, and Lattice's earlier 'AI employees' misstep) — non-deterministic, hallucination-prone, the opposite of an auditable rule-based narrative
- Business turbulence (ChartHop): multiple rounds of layoffs reported through 2024-2025 and a scope sprawl from org-chart tool to full suite — continuity risk for buyers
- Not white-label / not portable: no single-file artifact, no offline mode, no buyer-rebrandable distribution; can't be handed to a client as a self-contained deliverable
- Weak India-specific fit: no native INR/Indian-number-grouping focus; built US/global-first

**What we could do differently**
- Own the offline/privacy lane hard: market 'PII never leaves the tab, zero cloud, zero integration' as the explicit answer to ChartHop/Lattice for regulated, security-conscious, and India-data-residency buyers
- Sell deterministic vs. AI as a feature: position the rule-based, fully auditable narrative engine as the trustworthy alternative to their hallucination-prone AI summaries — 'every sentence traces to a number'
- Win on zero-infra TCO: a single-file, no-seat, no-implementation tool that an HR analyst opens and uses today undercuts their per-employee fees and multi-week onboarding entirely
- Lean into white-label/portability: a rebrandable, single dist/index.html a consultancy or HR vendor can hand to clients is something neither offers — target HR consultants, fractional CHROs, M&A/due-diligence reviewers
- Match ChartHop's org-chart credibility selectively: deepen span-of-control, future-dated headcount/movement forecast, and restructure 'what-if' views since org viz is their flagship and our most comparable surface
- Double down on India context as a wedge: INR formatting, Indian number grouping, and India HR-ops framing as a localized niche the US-first incumbents under-serve
- Target the under-served small/single-analyst buyer their $4k-9k floors price out — offline portability + monthly newsletter/PDF output is a complete deliverable for that segment
- Frame as complementary, not competing: an offline 'board-pack / monthly CHRO newsletter generator' that consumes exports from any HRIS (including theirs) — avoids head-to-head with their workflow stickiness

---

### Adjacent / complementary, not a direct competitor. Culture Amp is the category leader in employee engagement and sentiment analytics (a "listening" platform) — it measures how people FEEL via surveys, then ties sentiment to outcomes. Airpay HR Analytics measures the workforce SYSTEM OF RECORD — headcount, attrition, tenure, diversity, span of control, payroll/PMS/L&D structure — from HRIS-style snapshots. The two sit on opposite halves of people analytics: engagement/sentiment (Culture Amp) vs. operational/structural workforce analytics (us). They overlap only at the seams (attrition drivers, people-analytics dashboards), and Culture Amp is increasingly pushing into a unified "People Analytics" layer that blends HRIS data with engagement — the boundary to watch. Sources: cultureamp.com/platform/engage and /platform, Q3-2025 product blog, support product-updates-2025, security.cultureamp.com, plus G2/Gartner/TrustRadius/vendor comparison pages (2025-2026). — threat 2/5 · confidence: high

Culture Amp is a cloud SaaS "employee experience" platform built around continuous employee listening. Its flagship Engage module runs engagement, lifecycle (onboarding/exit), pulse, manager-effectiveness and DEI surveys, then turns responses into analytics: driver analysis, heatmaps, text/comment analytics, and engagement scores benchmarked against 6,000+ companies. It increasingly bundles three sibling modules — Perform (reviews, goals, 1:1s), Develop (manager/skills growth, coaching), and a unifying People Analytics layer that ingests HRIS data to do attrition prediction and link sentiment to business outcomes. 2025 added AI Coach (themes + action plans + drafted comms), AI comment summaries, a Heatmap Explorer, and SMS survey delivery for deskless workers. Sold per-employee-per-month, quote-only, integrating with major HRIS systems.

**Key features**
- Continuous employee listening: engagement, lifecycle (onboarding/exit), pulse, 360/manager-effectiveness and DEI surveys with research-backed question templates
- Industry-leading benchmarking against 6,000+ companies; driver analysis showing what most moves engagement
- Heatmaps + 2025 'Heatmap Explorer' for demographic cuts, trends and comment analysis without manual slicing
- AI Coach + AI comment summaries: surface themes, draft manager action plans, write audience-specific comms (LLM-based)
- People Analytics module: ingests HRIS data, runs attrition/flight-risk prediction tying sentiment to retention and business outcomes
- Adjacent modules Perform (reviews/goals/1:1s) and Develop (skills, coaching) to push from insight to action
- Deep HRIS integrations to auto-sync employee data; SMS survey delivery added 2025 for deskless reach
- Enterprise trust posture: SOC 2 Type II, dedicated data-privacy/trust center, survey confidentiality thresholds

**Strengths**
- Owns the engagement/sentiment data we don't have: the actual employee voice (the 'why' behind attrition), which pure HRIS analytics like ours cannot produce
- Benchmark moat — comparing scores to 6,000+ companies is a network-effect asset a single-tenant offline tool fundamentally cannot replicate
- Strong people-science credibility and research-backed survey design; trusted brand, 2025 HR Tech Award winner, strong Gartner/G2 standing
- Integrated insight-to-action loop (survey -> AI action plan -> manager goals/1:1s in Perform) that closes the loop we leave to a static newsletter
- Enterprise-grade trust and integrations (SOC 2 Type II, broad HRIS connectors) that de-risk large-org procurement
- AI-assisted interpretation lowers the analyst skill needed to act on data

**Weaknesses**
- Cloud-only SaaS: employee PII and sensitive sentiment data leave the building — a hard blocker for privacy-strict, air-gapped or data-residency-constrained buyers (no offline/on-prem story surfaced)
- Expensive and quote-only: PEPM model, no public list price; enterprise contracts commonly $50k-$200k+/yr, well out of reach for SMBs and cost-sensitive India-market buyers
- Heavy and survey-centric: real value needs employees actively responding to surveys plus ongoing program management — overkill if you only need workforce structure/attrition dashboards
- AI/LLM-dependent features cut against deterministic, auditable, reproducible reporting — outputs vary and aren't fully explainable
- Benchmarks skew to its largely Western/global-enterprise customer base; India-specific context, INR and local norms are not the focus
- Modular pricing stacks up fast (engagement + performance + analytics); setup and rollout are non-trivial vs. a single self-contained file

**Pricing model:** Per-employee-per-month (PEPM), quote-only / not publicly listed; modular (Engage, Perform, Develop, People Analytics priced separately). Estimates vary by source: basic Engage often cited ~$5-$14 PEPM; small/mid annual contracts roughly $4.5k-$45k; enterprise (1,000+ employees) commonly $50k to $200k+ per year. Add-ons (premium support, custom integrations) extra. Annual commitment.

**Target segment:** Mid-market to large enterprise (strongest at 500-1,000+ employees) HR/People teams running formal engagement and listening programs; global organizations that value benchmarking, people science and an integrated engage+perform+develop suite. Not aimed at SMBs, cost-sensitive, or offline/air-gapped buyers.

**Notable capabilities**
- Benchmarking against 6,000+ companies (network-effect data asset)
- Attrition/flight-risk prediction blending engagement signals with HRIS data
- AI Coach: auto-generated, people-science-grounded manager action plans and drafted comms
- Heatmap Explorer + AI comment/theme summaries over open-text feedback
- Lifecycle + 360 + manager-effectiveness + DEI survey suite with research-backed templates
- Unified People Analytics layer connecting sentiment, performance and development data

**What we could do differently**
- Stay in the structural-analytics lane and position as the privacy-first complement: 'all your workforce analytics with zero data leaving the tab,' explicitly for buyers who can't send employee data to a US cloud
- Add an OFFLINE engagement-survey ingest: import anonymized survey/eNPS CSV exports (Google/Microsoft Forms, or even a Culture Amp export) and compute drivers/heatmaps locally — capture the sentiment layer without the cloud or the subscription
- Lean hard on deterministic + auditable as the anti-AI differentiator: every number and every newsletter sentence is rule-traceable and reproducible, which compliance/works-council/regulated buyers value over LLM 'coaching'
- Win on India context + price: INR formatting, Indian number grouping, local norms, and a portable one-time cost model vs. PEPM that scales painfully with headcount
- Ship a built-in eNPS/engagement-index template plus a 'sentiment vs. attrition' cross-tab so a buyer gets ~80% of the engagement story offline without Culture Amp's full stack
- Emphasize zero-infra portability: a single self-contained index.html an HRBP runs on a locked-down laptop — no IT project, no integration, no vendor security review, the opposite of an enterprise SaaS rollout
- Offer optional anonymized, opt-in benchmark sharing (export/import of de-identified aggregates between deployments) to chip at the benchmark moat without a central database

---

### Org design, strategic workforce planning, and scenario/what-if modeling tools. Primary subjects: orgvue (the category-defining org-design + SWP platform) and Anaplan Workforce Planning (connected-planning/FP&A-led). Adjacents referenced for context: Visier (people analytics + new AI Org Design), ChartHop (visual headcount planning), Agentnoon (visual org modeling), and Workday Adaptive Planning. This is an enterprise-grade capability category our product currently lacks entirely. — threat 2/5 · confidence: medium

These tools let HR, finance, and strategy teams model the FUTURE shape of an organization, not just report its present. You harmonize people + position + cost + skills data into a baseline org model, then build and compare multiple "what-if" scenarios — restructures, M&A integration, layoffs/RIF, hiring freezes, location moves, span-and-layer optimization — and see the cost, headcount, capability, and risk impact before committing. orgvue is the specialist (data-driven org design, workforce planning, interactive org charts, skills/talent intelligence with external labor-market data, AWS-hosted browser app). Anaplan approaches the same problem from connected FP&A planning, with an AI "Workforce Analyst" agent and tight Workday integration. The output is forward-looking decision support for reshaping the workforce.

**Key features**
- Multi-scenario what-if modeling: clone a baseline org, edit roles/reporting lines/costs, and compare scenarios side-by-side on cost, headcount, capability, and delivery risk before committing
- Interactive org charts as the modeling surface — drag to restructure, add/remove roles, instantly see financial impact (orgvue, ChartHop, Agentnoon)
- Data harmonization layer: connect, clean, and reconcile people/position/cost/payroll data from multiple HRIS/finance systems into one baseline
- Span-of-control and layer/cost analysis to spot org bloat, management ratios, and cost-reduction opportunities
- Skills & talent intelligence: internal skills inventory plus EXTERNAL labor-market data to find capability gaps for future roles (orgvue)
- AI-driven scenario planning and conversational agents — Anaplan 'Workforce Analyst', Visier AI Org Design — to ask questions and auto-suggest plans
- Deep HRIS/FP&A integrations (Workday, finance systems) so plans stay synced to live workforce and cost data
- Cost-reduction / RIF / M&A workflow templates aimed at large-scale transformation programs

**Strengths**
- Solve a genuinely different, high-value problem (forward-looking org/workforce planning) vs. our backward-looking reporting — and command enterprise budgets for it (orgvue est. ~$30k-$150k+/yr license; ChartHop ~$8/employee/mo)
- Live, connected data: continuous sync to HRIS/finance means plans reflect current reality and feed back into systems of record
- Genuine scenario engine — true side-by-side comparison of cost/headcount/capability impact, the core capability we lack entirely
- External labor-market and skills intelligence (orgvue) that an offline tool structurally cannot provide
- AI/agentic layers (Anaplan Workforce Analyst, Visier) add conversational, predictive planning that's becoming table stakes at the high end
- Built for large enterprise transformation (M&A, restructures, cost takeout) with consulting-grade depth and support

**Weaknesses**
- Expensive, long, consultant-heavy implementations (orgvue 3-yr TCO commonly cited $150k-$600k+); overkill and unaffordable for SMB/mid-market, especially in India
- Cloud/SaaS by design (orgvue on AWS, Anaplan/Visier multi-tenant) — sensitive workforce + comp data leaves the customer's control; a hard blocker for privacy-strict or security-conscious buyers
- Heavy infrastructure and integration burden: data pipelines, HRIS connectors, IT projects, ongoing admin — the opposite of zero-infra
- Steep learning curve and admin overhead (Anaplan modeling, orgvue configuration) requiring trained specialists
- AI/agentic features raise governance, explainability, and data-residency concerns for regulated or AI-averse organizations — outputs aren't fully deterministic/auditable
- Anaplan/Adaptive are finance-led platforms; HR-specific depth and narrative/comms output are thinner than a purpose-built HR tool

**Pricing model:** Enterprise custom/quote-based, no public list pricing. orgvue: annual license commonly estimated ~$30k-$150k+ for a mid-sized company; 3-yr TCO (implementation + training + support) ~$150k-$600k+; generally pricier than Workday Adaptive, ChartHop, and Visier. Anaplan: seat/workspace + connected-planning licensing, enterprise-tier, quote-based. ChartHop (adjacent) is transparent: Headcount Planning ~$8/employee/mo standalone or ~$4/employee/mo as add-on, ~$9,000/yr minimum. All are recurring SaaS subscriptions — contrast with our one-artifact, no-per-seat, no-recurring-fee model.

**Target segment:** Large and global enterprises running transformation, restructuring, M&A integration, and cost-takeout programs; buyers are CHRO/HR strategy, FP&A/finance, and management consultancies. orgvue skews to consulting-led enterprise org-design engagements; Anaplan to finance-led connected planning. Mid-market and SMB (and most India-context cost-sensitive buyers) are largely priced/complexity-locked out — which is precisely the under-served segment our offline, zero-infra model can target.

**Notable capabilities**
- True side-by-side scenario comparison on cost / headcount / capability / delivery risk before committing resources (orgvue, Anaplan)
- Interactive org charts used as the live editing/modeling canvas, with immediate financial impact (orgvue, ChartHop, Agentnoon)
- External labor-market + internal skills intelligence to size capability gaps for future-state roles (orgvue) — not reproducible offline
- AI/agentic planning: Anaplan 'Workforce Analyst' conversational agent; Visier AI-powered Org Design
- Connected-data backbone: harmonization across HRIS/finance plus deep Workday integration keeping plans synced to live data

**What we could do differently**
- Ship a LIGHTWEIGHT, OFFLINE scenario sandbox: clone the current employee_master snapshot into an editable 'planned' org, let users add/remove/move roles and see headcount + INR cost + span/layer deltas instantly — deterministic, in-browser, no data leaving the tab. This is the single biggest gap to close and our clearest differentiator.
- Lean on our existing snapshot model: treat a scenario as just another snapshot kind so 'plan vs. actual' and month-over-month deltas reuse the metrics layer we already have — minimal new architecture.
- Position privacy as the wedge: 'model your reorg/RIF without uploading names, salaries, or org structure to anyone's cloud' — directly counters the SaaS data-exposure weakness for security-strict and India-context buyers.
- Make scenarios portable: a scenario lives inside the gzipped workspace file, so a CHRO can email a what-if to the CFO with zero seats, zero infra, zero per-employee fees — undercutting $8/employee and $30k+ license models.
- Deterministic 'org-design health' rules (span-of-control thresholds, layer count, manager ratios, vacancy/pending-exit exposure) surfaced as watch-outs and folded into the existing narrative engine — an auditable, explainable, no-AI alternative to their AI advisors.
- Drive the scenario into the monthly Newsletter: auto-generate a forward-looking 'if we execute this plan' section with cost/headcount impact and owner-tagged actions — pairing planning with comms, which FP&A-led tools do poorly.
- Be honest about the uncrossable moat (external labor-market/skills data, live HRIS sync) and don't chase it; win on a focused, affordable, private 'good-enough' planning layer for mid-market India.

---

### Big 4 people/workforce analytics: PwC Saratoga (benchmarking franchise + free/paid self-serve tools) and Deloitte Human Capital (consulting practice + accelerators + 2025 GenAI workforce suite). Both target large/enterprise HR & CHRO buyers globally, including India practices. — threat 2/5 · confidence: high

Two distinct go-to-market models. PwC Saratoga is a 40+ year HR benchmarking franchise: companies submit raw HR data and get back industry-specific benchmarks (1,000+ metrics, 30,000-40,000+ benchmarks, 80+ peer groups across 20+ industries), consumed via an online tool that exports charts/tables into reports and people dashboards. It is sold as memberships/consortiums (multi-year ~30% discount), a free 'Saratoga Impact' database, and a paid 'Spotlight on HR' subscription for HR-function size/spend/effectiveness. Deloitte Human Capital is a consulting-led practice selling people-analytics transformation (strategy-to-implementation) wrapped around accelerators: pre-built KPI dashboards, ready-to-use analytics models, a 'People Analytics Suite' for continuous data aggregation, ConnectMe (Salesforce-based HR service delivery), and a June-2025 GenAI suite (Workforce Analyzer for AI-disruption impact on roles; Workforce Planner+ for AI-driven labor supply/demand and scenario modeling). Deloitte markets 'insights as early as week six' and an HR AI maturity model.

**Key features**
- PwC Saratoga: 1,000+ HR/workforce metrics and 30,000-40,000+ industry benchmarks across 80+ peer groups / 20+ industries, sourced from 2,000+ client data submissions (cleaned/validated, not web-scraped)
- PwC Saratoga online tool exports charts/tables into reports, presentations and people dashboards; free 'Saratoga Impact' tier + paid 'Spotlight on HR' subscription; consortium/membership/custom delivery
- Deloitte accelerators: pre-built KPI dashboards, ready-to-use analytics models, turnkey HR-data-ecosystem integration with 'insights by week six'
- Deloitte People Analytics Suite: continuous monitoring/aggregation of org data for on-demand insight
- Deloitte 2025 GenAI suite: Workforce Analyzer (estimates AI disruption potential per role) + Workforce Planner+ (AI labor supply/demand, scenario & cost modeling)
- Deloitte ConnectMe: Salesforce-built HR service-delivery & employee-experience platform
- Both: heavy consulting/advisory layer, global cross-industry expertise, and (Deloitte) India-specific People Analytics practice

**Strengths**
- External benchmarking moat: PwC's 40+ year, 2,000+ client validated dataset lets a CHRO compare turnover/hiring/comp/DEI against true industry peers — something a single-org offline tool inherently cannot do
- Brand trust and board-level credibility: Big 4 logos carry weight with CHRO/CFO/audit committees that a self-serve tool must earn
- Full-stack delivery: strategy, data integration, change management and people to operationalize — buyers offload the work, not just buy software
- Deloitte's GenAI/agentic positioning (AI-disruption impact, autonomous workforce planning) lands on the hottest 2025-2026 budget theme
- Predictive/forward-looking modeling (Workforce Planner+ scenarios, supply/demand) beyond descriptive reporting
- Deep integration into enterprise HR data ecosystems (Salesforce/ConnectMe, multi-source pipelines)

**Weaknesses**
- Cost: enterprise/consulting pricing widely flagged as 'steep' — out of reach for SMB/mid-market and most India-context budgets; multi-year membership lock-in
- Data must leave the building: Saratoga requires submitting raw HR/PII data into PwC's study; Deloitte requires connecting HR data ecosystems and cloud platforms — a privacy, security-review and procurement hurdle
- Slow time-to-value: even Deloitte's fast path is 'week six'; Saratoga is an annual study cadence — neither is instant or self-serve
- Infrastructure & dependency: cloud platforms, integrations, and ongoing consultant/analyst involvement; not portable or self-contained
- Benchmarking data is generic to peer groups and lags (annual); not tailored to one company's live monthly snapshots
- Opaque, quote-based pricing and procurement friction; no real try-before-buy beyond a thin free benchmark tier
- Rising AI/GenAI dependence raises explainability, data-governance and 'black box' concerns for regulated/conservative buyers

**Pricing model:** Opaque, quote-based enterprise pricing. PwC Saratoga: paid annual benchmarking memberships/consortiums (multi-year sign-up ~30% discount) + a free 'Saratoga Impact' benchmark tool + paid 'Spotlight on HR' subscription. Deloitte: project-based consulting engagements plus licensed accelerators/platforms (People Analytics Suite, ConnectMe, 2025 AI suite). Both widely described as expensive; no public list prices.

**Target segment:** Large enterprise & upper-mid-market global HR/CHRO/reward & people-analytics teams (Saratoga study participants; Deloitte transformation clients), including India practices — buyers with budget for consulting fees, multi-year memberships and security/procurement review cycles.

**Notable capabilities**
- Industry-peer benchmarking at scale (PwC: 30,000-40,000+ benchmarks from 2,000+ clients over 40+ years)
- GenAI/agentic workforce planning and AI-role-disruption analysis (Deloitte 2025 suite)
- Continuous org-data aggregation and predictive scenario/cost modeling
- Enterprise HR-data integration + Salesforce-based service delivery (ConnectMe)
- Consulting-led change management and operationalization, not just tooling

**What we could do differently**
- Lead with radical privacy/zero-egress: 'your PII never leaves the tab' directly counters Saratoga's data-submission and Deloitte's data-ecosystem-connection requirements — turn the security review from a months-long blocker into a non-issue
- Win on time-to-value and cost: instant single-file deployment and a flat/near-zero price vs 'week six' + steep enterprise consulting fees — own the SMB/mid-market and India segments the Big 4 price out
- Position 'deterministic, auditable, no-AI narrative' against Deloitte's GenAI black box — every newsletter sentence is rule-traceable, safe for compliance/works-council/regulated buyers
- Embrace 'no benchmarking by design': market self-contained internal analytics (headcount, attrition, tenure, span, data quality, monthly deltas) as the privacy-preserving complement to external benchmarks; optionally let users paste public Saratoga Impact/Workforce Index figures as a manual benchmark overlay
- White-label + zero-infra channel play: let HR consultancies/SI partners in India resell under their own brand to clients who can't afford Big 4, undercutting the accelerator/dashboard layer Deloitte sells
- Ship the deterministic CHRO newsletter + owner-tagged action plan as the headline differentiator: Big 4 sell dashboards and decks; an automated, printable monthly narrative brief is a distinct, sticky artifact
- Target the gap left by annual cadence: emphasize live month-over-month KPI deltas and a cross-tab 'needs attention' banner — continuous internal insight with no study cycle or analyst

---

### Big 4 consulting workforce/people analytics: EY (People Experience Platform, EY.ai Workforce, Workforce Strategy/Planning & Analytics) and KPMG (Powered Enterprise HR, People Analytics, Workforce Intelligence/AI agents with Workday Adaptive Planning, Velocity on ServiceNow). Both are advisory-led, platform-enabled service offerings, not standalone shrink-wrapped HR analytics software. — threat 2/5 · confidence: medium

EY and KPMG sell consulting-led people/workforce analytics as part of large HR transformation engagements. EY's People Experience Platform aggregates enterprise people + performance + behavioral/operating-system data into a single executive index, correlates experience to operational KPIs, applies predictive analytics to flag business risk, and benchmarks against industry peers via a science-based index; EY.ai Workforce adds GenAI 'digital workers' for the HR function. KPMG delivers People Analytics plus Powered Enterprise HR (pre-built operating models and assets layered on Workday, Microsoft, ServiceNow), and an AI-agent-driven Workforce Intelligence approach for strategic workforce planning (skills forecasting, scenario modeling) typically built on Workday Adaptive Planning. Both bundle proprietary benchmarks, change management, and advisory rather than selling a self-serve product.

**Key features**
- EY: aggregated 'Executive Insight' index correlating employee experience to operational KPIs, with predictive risk flags
- EY: 'Expanded Listening' that pulls behavioral data from operating systems (not just surveys) plus peer benchmarking via a science-based index
- EY.ai Workforce: GenAI digital-worker agents to add HR capacity/productivity
- KPMG Powered Enterprise HR: pre-defined operating models, leading-practice playbooks, and accelerator assets on top of Workday/Microsoft/ServiceNow
- KPMG: AI-agent strategic workforce planning (skills demand/supply forecasting, scenario modeling) via Workday Adaptive Planning
- Both: proprietary cross-industry benchmark datasets and predictive/ML analytics
- Both: heavy change-management, advisory, and systems-integration wrap around the analytics

**Strengths**
- Trusted brand + senior advisory: CHROs/boards buy the partner relationship and benchmarks, not just software
- Proprietary cross-client benchmark data and science-based indices that a single-tenant tool cannot replicate
- Deep change-management, org-design and transformation muscle to drive adoption end-to-end
- Tight alliances (Workday, Microsoft, ServiceNow) embed analytics directly into clients' systems of record
- GenAI/agentic roadmap and large R&D budgets keep capabilities current
- Global delivery scale and ability to staff multi-year, multi-geography programs

**Weaknesses**
- Service-led, not productized: outcomes depend on expensive consultants and bespoke scoping, not a buy-and-run tool
- High cost and long timelines — out of reach for mid-market and most Indian firms
- Cloud/SaaS + alliance platforms mean PII leaves the tenant and integration/IT lift is heavy
- Data residency, privacy and 'our data going to a consultancy or cloud' concerns; not air-gap deployable
- Vendor lock-in to Workday/Microsoft/ServiceNow stacks; little value without those systems
- Opaque, ML/AI 'black-box' outputs and undisclosed pricing reduce transparency and auditability
- Overkill for a recurring monthly CHRO newsletter / standard people-analytics reporting need

**Pricing model:** Undisclosed, engagement/consulting-based (project fees + platform/licensing on partner stacks like Workday/ServiceNow); 'request a demo / contact us' motion, no public per-seat or SaaS list price.

**Target segment:** Large/global enterprises and boards undertaking HR transformation; budgets for multi-year advisory engagements. Not aimed at SMB or self-serve buyers.

**Notable capabilities**
- Proprietary cross-industry benchmark datasets and 'science-based' experience indices
- Predictive/ML analytics and agentic GenAI for workforce planning and HR productivity
- Embedded delivery via Workday Adaptive Planning, Microsoft, and ServiceNow alliances

**What we could do differently**
- Lead hard on air-gapped, offline, single-file deployment: PII never leaves the tab — a direct answer to the 'data leaving to a consultancy/cloud' objection EY/KPMG can't match
- Position as zero-infra, zero-IT, instant value: a CHRO opens one HTML file and gets a newsletter today, no Workday/integration project or consultants
- Own the deterministic, fully auditable narrative: rule-based prose (no LLM, no black box) is defensible to legal/audit where Big-4 GenAI outputs are not
- Win the mid-market / India SMB segment the Big 4 ignore on price, with INR formatting and Indian number grouping baked in
- Sell white-label so HR consultancies and payroll/HRMS vendors in India can resell it as their own monthly-report engine — productize what the Big 4 deliver as billable hours
- Compete on repeatable monthly cadence (snapshots, MoM deltas, action plan) versus episodic, project-based engagements
- Ship optional anonymized benchmark presets to blunt the Big 4's benchmark advantage without ever ingesting client PII

---

### Capability sweep of predictive attrition, headcount/cost planning and scenario modeling in HR analytics (2025-2026). Covers the methods (statistical + ML), the vendors who do it best, and a hard line between what is realistically buildable CLIENT-SIDE (offline, no server, no LLM) versus what genuinely needs a backend. Framed against Airpay HR Analytics' offline, privacy-first, deterministic, single-file positioning. — threat 2/5

Predictive workforce analytics estimates two things: (1) attrition risk - who is likely to leave and, with survival models, when - and (2) future headcount and labour cost under different business assumptions. Best-in-class platforms combine an integrated people-data warehouse, ML attrition scoring (typically random forest / gradient-boosted trees, with logistic regression and survival analysis as interpretable alternatives), explainability layers (SHAP/LIME) so HR can see WHY someone is flagged, and interactive what-if scenario modeling (slow hiring, open a market, cut a team) that recomputes headcount, skills gaps and cost in real time. Visier exemplifies the attrition side (random forest, requires 24 months history to predict and 36 to validate, markets 'up to 8x more accurate than guesswork'); Workday Adaptive Planning, Anaplan and Planful exemplify driver-based scenario/cost planning; ChartHop does visual org-chart what-ifs with live budget impact.

**Key features**
- Attrition risk scoring per employee, usually via random forest or gradient-boosted trees (XGBoost/LightGBM); logistic regression for interpretability; survival analysis to estimate time-to-resignation, not just probability
- Explainable AI overlays (SHAP/LIME) surfacing the top risk drivers per individual/segment - increasingly table-stakes for fairness and manager trust
- Driver-based headcount & fully-burdened cost models: position-level inputs (dept, level, salary, benefits, bonus, ramp) rolled up into budget
- Interactive what-if scenario modeling with parallel versions and side-by-side compare (hiring freeze, attrition spike, M&A, new region), recalculated live
- Forecasting that links attrition + planned hiring to net headcount, capacity and skills-gap projections
- Deep auto-integration to HRIS/ATS/payroll/engagement systems and external enrichment (labour-market, LinkedIn skills, macro, cross-company benchmarks)
- Continuous model retraining on rolling data (Visier markets 'continuous machine learning') plus collaborative planning with HR/Finance approval workflows

**Strengths**
- Accuracy & data scale: server-side ensembles trained on multi-year, multi-source, sometimes cross-client data outperform any single-tenant offline model
- Zero data prep for the buyer: live HRIS/payroll/ATS connectors keep models fresh automatically with no manual exports
- Benchmarks: Visier/ADP DataCloud leverage huge anonymized datasets for external comparison no offline tool can replicate
- Collaboration: Anaplan/Planful/Workday/ChartHop support multi-user plans, approval workflows and finance-HR co-planning with version control
- Continuous retraining keeps predictions current as the workforce changes; explainability (SHAP) is built in and validated
- Skills/capacity intelligence and AI-generated draft scenarios (ChartHop) lower the effort to build and compare plans

**Weaknesses**
- Expensive and infra-heavy: ChartHop ~$8 PEPM core + $4/module with ~$9k/yr minimum; Visier/Workday/Anaplan are enterprise-priced and need implementation projects
- Data residency / privacy exposure: PII flows to vendor cloud and (for benchmarks) into shared datasets - a hard blocker for privacy-sensitive, regulated or India-data-localization buyers
- Long time-to-value: Visier needs 24-36 months of clean history before predictions are trustworthy; integrations take weeks/months
- Black-box anxiety & ML governance burden: ensemble scores require SHAP tooling, bias monitoring and retraining ops to defend decisions
- Overkill for SMB / single-entity HR teams that just want directional attrition flags and a credible headcount/cost plan
- Vendor lock-in and connectivity dependence: nothing works offline, air-gapped, or as a portable file you can email

**What we could do differently**
- Ship deterministic attrition RISK SCORING fully client-side without an LLM: a transparent weighted rule/logistic-style index over the data you already have (tenure band, time-since-promotion, comp-vs-band gap, overtime/leave signals, manager span, pay changes, performance dips). Every employee's score breaks down into named, auditable contributors - that IS your explainability, and it beats a black box for HR defensibility.
- If you ever want true ML, browser XGBoost-via-WASM and logistic regression in TF.js are proven on small datasets (~96% of native accuracy, sub-7ms inference, no data leaves the tab) - so an optional in-browser 'train on my own history' model is achievable while staying offline and serverless; keep it opt-in so the default stays deterministic.
- Own driver-based headcount & INR cost planning client-side: it is pure arithmetic. Position-level rows + assumptions (hires, exits using YOUR attrition rate, salary/benefit/bonus drivers) rolled into a fully-burdened budget with Indian number formatting - directly rivals Excel/Planful templates with zero infra.
- Add interactive, deterministic what-if scenarios as saved, comparable snapshots: hiring freeze, attrition +X%, reorg, new-location ramp - recomputed instantly in-tab and diffable side-by-side, mirroring the headline feature of Anaplan/ChartHop without their cost or cloud.
- Lean hard on survival-style time-to-attrition using historical snapshots you already store: a deterministic Kaplan-Meier / hazard curve gives 'expected exits in next 1/3/6 months' per cohort with no training data minimum and full transparency.
- Position the wedge competitors structurally cannot match: offline, air-gapped, PII-never-leaves-tab, single portable file, no per-seat fee, India data-localization-friendly, deterministic & explainable-by-construction (no AI governance burden) - sell to privacy-sensitive, regulated, and SMB buyers Visier/Workday price out or scare off.
- Reframe the data-history weakness as honesty: clearly label outputs as deterministic projections/risk indices (not opaque AI predictions) and require far less history than Visier's 24-36 months, making time-to-value immediate.

---

### Capability sweep across five adjacent HR-analytics frontiers (not a single competitor): (1) pay-equity analytics, (2) DEI/representation analytics, (3) skills intelligence, (4) organizational network analysis (ONA), (5) GenAI narrative insights -- plus the cross-cutting governance/compliance layer (SOC2, GDPR, India DPDP Act, EU Pay Transparency Directive, EU AI Act, NYC LL144). Representative vendors surveyed: Syndio (PayEQ), Trusaic (PayParity), PayAnalytics for pay equity; Gloat, Eightfold, Fuel50 for skills; Microsoft Viva Insights, Worklytics, Humanyze for ONA; Visier (Vee), Workday (Illuminate) for GenAI narratives. These are mostly cloud SaaS, enterprise-priced, integration-heavy platforms -- the opposite end of the spectrum from an offline single-file tool. — threat 2/5 · confidence: high

Collectively, this market turns workforce data into compliance-grade and strategy-grade intelligence in five directions. Pay-equity tools (Syndio, Trusaic, PayAnalytics) run regression-based pay-gap analysis, intersectional cuts, what-if remediation simulations (e.g. Trusaic R.O.S.A., Salary Range Finder) and produce defensible audit trails mapped to laws like the EU Pay Transparency Directive and US state pay laws. DEI analytics track representation, hiring/promotion/pay disparities and goal progress -- though 2025 saw heavy re-labeling ('inclusion & belonging') and reduced public disclosure amid political backlash. Skills-intelligence platforms (Gloat, Eightfold) build AI/ML skills ontologies (knowledge graphs) inferred from billions of data points to power internal mobility, talent marketplaces and build/buy/borrow workforce planning. ONA tools (Viva Insights, Worklytics, Humanyze) passively mine email/Teams/Slack metadata to map collaboration networks, find 'information broker' bridges and measure cross-team flow. GenAI assistants (Visier Vee, Workday Illuminate) add a conversational/natural-language layer over people data, returning narrative answers grounded in domain models (Vee cites a 25M-record community dataset, 2,000+ metrics). All five are converging on cloud SaaS delivered with AI on top.

**Key features**
- Pay equity: regression-based gap detection, intersectional analysis, what-if remediation engines (Trusaic R.O.S.A.), salary-range guardrails, and law-mapped defensible reporting (EU Pay Transparency Directive, US state laws)
- Skills intelligence: self-evolving AI skills ontologies/knowledge graphs (Gloat, Eightfold) inferred from billions of signals, powering internal talent marketplaces, gigs, and build/buy/borrow planning
- ONA: passive, survey-free collaboration mapping from M365/Slack/Zoom metadata; 'information broker' and bridge detection (Viva Insights May-2025 templates); 400+ metrics and AI-adoption tracking (Worklytics)
- GenAI narratives: conversational NL query over people data with auto-generated prose answers (Visier Vee, Workday Illuminate), lowering the data-literacy bar for CHROs/managers
- DEI dashboards: live representation/hiring/promotion/pay disparity tracking with goal-setting -- now being re-labeled and selectively de-published in 2025
- Compliance posture: SaaS vendors lean on SOC2/GDPR certifications, data-residency options, and bias-audit support (NYC LL144) as table-stakes enterprise sales requirements

**Strengths**
- Depth and defensibility: pay-equity engines produce statistically rigorous, audit-ready, legally defensible outputs with embedded remediation simulation -- well beyond surface KPIs
- Live integration moat: ONA and skills tools ingest continuous behavioral/system data (M365, HRIS, Slack), creating insight that a manually-loaded snapshot tool structurally cannot replicate
- AI accessibility: GenAI assistants make analytics usable by non-analysts via plain-language Q&A, expanding the buyer beyond the people-analytics specialist
- Regulatory tailwind: EU Pay Transparency Directive (transposition due 7 June 2026; mandatory joint pay review on >5% unexplained gaps) and DPDP/pay-transparency laws are forcing pay-equity tooling onto the budget
- Enterprise trust signals: established SOC2/GDPR certifications, benchmarks, and large community datasets (Vee's 25M records, 250M benchmarks) that a standalone offline tool cannot match

**Weaknesses**
- Privacy and data-residency exposure: cloud SaaS sends sensitive comp/PII/biometric-class data off-premise -- a sharp liability under India DPDP (penalties up to Rs 250 crore) and GDPR, and a recurring blocker for security-sensitive buyers
- GenAI reliability gap: LLM assistants are non-deterministic with hallucination rates cited at 20-60%; incorrect personal-data outputs are unacceptable for HR decisions and hard to audit -- regulators (EDPB) and the EU AI Act (HR = high-risk Annex III) are tightening scrutiny
- ONA surveillance backlash: passive metadata mining of employee communications carries works-council, ethics, and DPDP-consent risk and growing employee distrust
- Cost and complexity: enterprise SaaS pricing, long integration/implementation, and per-seat fees (e.g. Viva ~USD 3/user/mo and far higher for specialist suites) shut out SMB/mid-market and India-cost-sensitive buyers
- Fragmentation: pay-equity, skills, ONA, and DEI are mostly separate point solutions -- buyers must stitch multiple vendors and contracts together
- Compliance enforcement uncertainty: e.g. NYC LL144 enforcement found 'ineffective' in a 2026 Comptroller audit -- vendors sell audit features whose regulatory teeth are still maturing

**Pricing model:** Predominantly enterprise cloud SaaS, annual per-employee or per-seat subscriptions, usually quote-based with implementation/integration fees. Reference point: Microsoft Viva Insights ~USD 3/user/month (cheapest, because it rides existing M365); specialist pay-equity, skills-intelligence, and ONA suites (Syndio, Trusaic, PayAnalytics, Gloat, Eightfold, Worklytics, Humanyze, Visier) are materially more expensive, custom-negotiated enterprise contracts. GenAI assistants (Visier Vee, Workday Illuminate) are bundled into platform subscriptions. This stands in direct contrast to our one-time / no-infrastructure, single-file offline model.

**Target segment:** Mostly large/global enterprises with mature people-analytics functions, legal/compliance teams, and existing cloud HRIS (Workday, SAP, M365). Pay-equity and pay-transparency tooling is being pulled in by EU/US-regulated multinationals; ONA skews to large hybrid Microsoft-centric orgs; skills intelligence targets big enterprises pursuing skills-based-organization transformations. SMB, security-restricted, air-gapped, and India cost-sensitive mid-market buyers are largely under-served -- our opening.

**Notable capabilities**
- Trusaic R.O.S.A. remediation engine runs hundreds of pay-adjustment simulations to optimize spend; Salary Range Finder prevents future inequities
- Syndio PayEQ intersectional pay analysis explicitly mapped to EU Pay Transparency Directive, Equal Pay Act, Title VII, and 2025 federal executive orders
- Gloat / Eightfold continuously-evolving skills ontologies built from billions of data points, feeding internal talent marketplaces and gig/mobility matching
- Microsoft Viva Insights May-2025 'information broker' query templates that identify cross-team bridge individuals from passive M365 collaboration data
- Visier Vee conversational GenAI assistant grounded in a 25M-record anonymized community dataset, 2,000+ metrics, and 250M benchmarks, returning narrative answers
- Worklytics privacy-first ONA across 25+ tools with 400+ metrics and dedicated AI-adoption (Copilot and beyond) tracking

**What we could do differently**
- Own the privacy/residency wedge: position offline single-file delivery as the only architecture where comp, demographic, and network data never leave the tab -- directly answering DPDP (legitimate-use + consent), GDPR, and works-council objections that block cloud ONA/pay tools in India and the EU
- Add a deterministic pay-equity module: rule-based gap detection by gender/location/grade with a transparent, explainable methodology and a built-in 'EU >5% unexplained-gap' flag and remediation cost simulator -- defensibility without a regression black box or a cloud upload
- Lean into 'deterministic narratives as a feature, not a limitation': market the rule-based newsletter engine as hallucination-free, auditable, and reproducible -- the safe counter-narrative to non-deterministic GenAI (20-60% hallucination) for regulated HR decisions
- Ship a lightweight, survey-free 'org/collaboration' view from data already in the HRIS (reporting lines, span, cross-unit movement) -- ONA-flavored insight without surveillance of employee communications or consent exposure
- Add a privacy-resilient skills layer: let users import their own skills taxonomy/competency framework and compute coverage, gaps, and adjacencies deterministically in-browser -- skills intelligence without an opaque AI ontology or PII egress
- Bake compliance into the product story: a built-in, exportable 'governance one-pager' (no network calls, no PII egress, deterministic, audit-log of inputs) that maps to DPDP / GDPR / EU AI Act high-risk concerns -- turning compliance from a checkbox into the core sales pitch
- Re-frame DEI for the 2025 backlash climate: offer neutral, internal-only 'representation & equity' analytics that run locally and are never published -- exactly the 'quiet commitment / strip the label, keep the work' posture enterprises are adopting
- Target the under-served SMB / India mid-market priced out of enterprise SaaS: white-label, zero-infra, one-file deployment with INR formatting as a deliberate down-market and consultant-friendly distribution play

---
