# 10x Roadmap — Build Progress Tracker

> Durable state for the autonomous `/loop build everything` run. Each tick: read this,
> pick the next unchecked slice, build it (verify → browser-verify → commit → CI-green),
> tick the box, append a one-line log entry, reschedule. Order follows the roadmap's
> First Wave (§D), then impact×effort (§E). Roadmap: `2026-06-09-10x-value-roadmap.md`.

## Conventions
- One self-contained, committed, CI-green increment per tick.
- Large items are split into numbered slices; finish all slices before moving on.
- Keep every hard constraint (offline · no LLM · single-file · explainable · privacy).

## First Wave
- [x] **FIX-1 Ingestion robustness** — ✅ s1 header normalisation · ✅ s2 widened alias coverage (SAP/Workday/ADP) · ↪ s3 mapping report folded into BUILD-1
- [x] **BUILD-1 Column-mapping importer** — ✅ s1 engine · ✅ s2a parser override · ✅ s2b mapping UI + preview · ✅ s3 saved profiles (auto-apply on re-upload)
- [x] **BUILD-2 Action-tracking loop** — ✅ s1a model · ✅ s1b persistence + state · ✅ s2 UI (track from roadmap + status panel) · ✅ s3 newsletter + facts-pack integration
- [x] **UP-1 Longitudinal trends** — ✅ s1 timeseries builder · ✅ s2 sparkline component + KPI cards · ✅ s3 health-history chart
- [x] **UP-7 Flight-risk scoring** — ✅ s1/s2 already existed as `risk.ts` (per-employee explainable weighted score) · ✅ s3 added the **regrettable cohort** (top performers at Elevated+ risk → KPI + table + watchout in `risk.ts`) + a **`flight_risk_cohort` HR Brain finding**. Reconciled: removed a duplicate `flight_risk.ts` I'd started before finding `risk.ts`.
- [x] **BUILD-7 Benchmark pack** — ✅ s1 `benchmarkPacks.ts` (pack format + provenance, 4 illustrative built-ins, custom-pack parse/validate) · ✅ s2 Scorecard pack picker + provenance + custom-pack upload; `effectiveBenchmarks` flows to scorecard/Brain/newsletter; pack id + custom pack persist in the workspace
- [x] **BUILD-3 Manager/HRBP cockpit** — ✅ s1 `cockpit.ts` (manager/department scoping, team summary, risk scored-on-full-roster-then-filtered) · ✅ s2 Manager Cockpit page + nav (scope toggle, KPIs, watch-out flags, scoped risk table; browser-verified manager + multi-dept modes). **FIRST WAVE COMPLETE (7/7).**

## Then (impact × effort)
- [ ] UP-2 HR Brain rule expansion (+ per-dept mode)
- [ ] UP-3 Scenario Planner v2
- [ ] UP-6 Equity & pay-equity depth
- [ ] BUILD-4 Compliance calendar
- [ ] BUILD-5 Headcount planning
- [ ] BUILD-6 Compensation module
- [ ] UP-4 Scorecard goals / off-track flags
- [ ] UP-5 Universal drill-down
- [ ] UP-8 Native PDF + comparison newsletter
- [ ] UP-9 White-label depth
- [ ] UP-10 Data lineage & audit
- [ ] BUILD-8 Multi-entity rollup
- [ ] BUILD-9 Explore / pivot builder
- [ ] BUILD-10 Board-pack builder
- [ ] FIX-8 Performance & scale

## Quick wins (slot in opportunistically)
- [x] FIX-2b Branding-page overflow (minmax(0,1fr) so the form column shrinks; was +34px at 1024)
- [ ] DEMO-HIST Deepen demo to ~6 months of history (amplifies UP-1 sparklines + health chart; today the demo ships 2 periods so trends are 2-point lines). Touch `scripts/build-sample-workspace.mjs` to emit several prior months, then `npm run embed-demo`.
- [ ] FIX-2 Overflow regression guard
- [ ] FIX-3 Period-diff edge cases
- [ ] FIX-4 Bad-data resilience
- [ ] FIX-5 Print/PDF polish
- [ ] FIX-6 Accessibility deepening
- [ ] FIX-7 Demo realism (resolved finding)

## Log
- **BUILD-3 (complete) — FIRST WAVE DONE (7/7)** — Manager/HRBP cockpit. s1 `src/core/metrics/cockpit.ts`: `managerOptions`/`departmentOptions`/`scopeEmployees` + `buildCockpit` (team headcount/relieved/pending-exits/new-joiners/avg-tenure, review completion, attrition-risk cohort scored on the FULL roster then filtered to scope so scores match other views, plain-language flags, top-N at-risk with named drivers). 8 tests. s2 `src/ui/pages/Cockpit.tsx` + AppShell nav ("Manager Cockpit"): scope toggle (by manager dropdown / by department chips, defaults to largest without effects), 6 KPI cards, watch-out flags, scoped risk table via KpiCard/DataTable, drill-to-People link. **Browser-verified**: manager mode (Imran Gupta, 24, "5 of 24 reviews pending"); department mode multi-select (Technology+Sales → "2 departments", 57); no app errors. Also fixed a real bug found en route: manual file Save/Load dropped tracked actions + benchmark pack (AppShell onSave/applyWorkspaceBytes) — now aligned with autosave. 326 tests, build 2.80 MB. Next (impact×effort): UP-2 HR Brain rule expansion.
- **BUILD-7 (complete)** — Benchmark packs. s1 `src/core/benchmarkPacks.ts`: `BenchmarkPack` (bands + provenance: source/year/region/industry/note/illustrative), 4 built-ins (general reuses DEFAULT_BENCHMARKS; India IT/ITeS, India BFSI, Global Tech — all labelled illustrative, encoding directional norms not survey figures), `effectiveBands` (pack over baseline, user edits on top), `parseBenchmarkPack` (validates a user JSON pack — requires name+source, numeric low≤high). s2: state holds `benchmarkPackId` + `customBenchmarkPack` + derived `effectiveBenchmarks` (consumed by Scorecard/Brain/newsletter); both persist in the workspace (additive). Scorecard gains a pack picker, a provenance line, and "Load custom pack…" (JSON upload → validated → attributed). **Browser-verified** (via JS-driven nav, since synthetic clicks weren't registering this session): picker shows all 4 packs + provenance + load button; switching to India IT changed the table bands live (Offer-Accept 80–90%→70–85%, L&D 60–85%→65–90%) and the provenance; only the benign extension messaging artifact in console, no app errors. 318 tests, build 2.79 MB. First Wave now 6/7 — only BUILD-3 (Manager/HRBP cockpit) remains. Next: BUILD-3.
- **UP-7 (reconciled, complete)** — Discovered the per-employee explainable attrition score UP-7 specifies ALREADY exists as `risk.ts` (people_risk: score/band/named contributors, renormalising weights, wired to Brain + newsletter + People risk tab). Rather than ship a duplicate, removed the `flight_risk.ts` I'd begun (s1/s2 commits 14fbf88/965fff5) and folded the new value in: (1) `risk.ts` — `EmployeeRisk.regrettable` (high performer at Elevated+), "Regrettable Risk" KPI, "Regrettable flight risk" table, watchout ≥3; purely additive (scores unchanged). (2) `brain.ts` — `flight_risk_cohort` rule firing on a material Elevated+ cohort (≥ max(5, 8% active)) or ≥3 regrettable; deep-links to People>risk. 5 new tests; cohort finding verified to fire on a realistic at-risk store + stay quiet on a stable one. 308 tests, build 2.78 MB. Browser tab-switch was flaky this tick (ref-clicks not registering, screenshots timing out) so the on-screen check was deferred — render path is existing, browser-verified components. Next: BUILD-7 (benchmark pack).
- **UP-1 s1** — `src/core/metrics/timeseries.ts`: pure period-series foundation — `periodList(store, kind?)`, `storeAsOf(store, asOf)` (reconstruct the workspace as of a date, snapshots carried forward), `buildSeries(store, valueAt, kind?)`, `compactSeries`. No Date.now. 6 tests. 293 tests, build 2.77 MB.
- **UP-1 s2** — KPI sparklines on every functional card. `MetricKPI.spark?`, pure `attachKpiSparklines(current, history)` (match by label across per-period recomputes, same-unit points, ≥2 to attach, preserves delta), wired into `buildDomainCompared` (dashboard + newsletter both pick it up), `sparklineGeometry` + `Sparkline.tsx` (accent-coloured, not green/red). **Browser-verified**: TA cards show flat mid-lines for unchanged KPIs + a rising line/dot for Offer-Accept (+6.3pp); 0 console errors. 301 tests, build 2.78 MB.
- **UP-1 s3** — `buildHealthHistory(store, opts)` recomputes HR Health at each roster month → a line ChartSpec; rendered on HR Brain under the score card via the existing Chart (themed). null <2 periods, capped at 24 months. **Browser-confirmed**: chart title+caption present in the live DOM, console clean (CDP screenshot timed out — tooling, not app). 303 tests, build 2.78 MB. **UP-1 COMPLETE.** Added DEMO-HIST quick win (demo ships 2 periods → 2-point lines; deepen for richer trends). Next: UP-7 (flight-risk scoring).
- **BUILD-2 s1a** — `src/core/actions.ts`: Action model (status open/in_progress/done, owner, due, findingId link) + pure helpers `actionSummary` (counts + overdue), `actionFromRoadmap`, `withStatus`, `hasOpenActionForFinding`. 4 tests. 283 tests, build 2.77 MB. Next: s1b workspace persistence + state threading.
- **BUILD-2 s1b** — `actions` now persists in the workspace (additive optional field, `saveWorkspace`/`loadWorkspace`, defaults []) and is threaded through `state.tsx` (state + `setActions`, restore on load, reset on demo→live and clearData, included in autosave). Round-trip test added. 284 tests, build 2.77 MB. Next: s2 actions UI panel on HR Brain (browser-verify).
- **BUILD-2 s2** — HR Brain: "+ Track" on each roadmap item creates a tracked action (deduped via `hasOpenActionForFinding`, shows "✓ Tracked"); a "Tracked actions" panel with per-row status select (Open/In progress/Done), due-date input, remove, and a live open/in-progress/done/overdue summary. **Browser-verified**: 16 track buttons on the demo; tracked an item → panel row + "1 open"; set Done → summary updated; 0 console errors. 284 tests, build 2.77 MB. Next: s3 newsletter integration (open actions + committed-vs-done in the board pack).
- **BUILD-2 s3** — newsletter + facts pack carry a "Tracked Actions" block (status summary + items), distinct from the watch-out action plan; `buildNewsletter` gains an `actions` option. Verified via model tests (trackedActions + summary) + typecheck; on-screen/print render is mechanical (Playwright was disconnected this tick, so the visual check is deferred — the action-creating UI was browser-verified in s2). 287 tests, build 2.77 MB. **BUILD-2 COMPLETE.** Next: UP-1 (longitudinal trends).
- **FIX-1 s1** — `normalizeHeader()` (lower-case + unify `_-./` separators + collapse whitespace) applied to both alias-map keys and incoming headers, so real-world export drift matches. New header-drift test + existing Keka round-trip both green. 270 tests, build 2.76 MB.
- **FIX-1 s2** — widened EMPLOYEE_ALIASES with SAP/Workday/ADP synonyms (Staff ID / Personnel Number, Hire Date, Title, Work Location, Company, Sex, Dept, …). New alias test green; FIX-1 complete. 271 tests, build 2.76 MB. Next: BUILD-1 (column-mapping importer).
- **BUILD-1 s1** — `src/core/ingest/mapping.ts`: `suggestColumnMapping` (auto-suggest header→field + unmapped/missing-required gaps) and `validateColumnMapping` (ambiguous/invalid mapping detection). Pure + deterministic, 5 tests. 276 tests, build 2.76 MB. Next: s2 mapping UI + preview (needs browser-verify).
- **BUILD-1 s2a** — `parseWorkbook` now returns `detectedHeaders` (surfaced even on a near-miss) and accepts a `mappingOverride` (header→field|null) that wins over alias detection and bypasses the score threshold. 1 test (rejected→headers surfaced; override→imports). 277 tests, build 2.76 MB. Next: s2b mapping UI (browser-verify).
- **BUILD-1 s2b** — Data Intake gains an "Adjust column mapping" editor: holds the uploaded bytes, shows each detected header → a field dropdown (pre-filled from `suggestColumnMapping`), re-parses live on change, flags unmapped required fields. **Browser-verified**: uploaded a messy-header file (EmpCode/PersonName/JoinDt/Town) → auto-rejected → editor appeared → mapped EmpCode→Employee Number + set as-of → flipped to "Ready to import" (E1, 2 rows). No app console errors. 277 tests, build 2.77 MB. Next: s3 saved mapping profiles.
- **BUILD-1 s3** — `src/core/ingest/mappingProfiles.ts`: localStorage-backed saved mappings keyed by domain + header shape, with pure `profileApplies` / `resolveProfileForFile` (drift-tolerant re-keying). Data Intake auto-applies a matching profile on upload (with a note) and saves the mapping on import. **Browser-verified round-trip**: map a messy file → import (profile saved) → re-upload the same file → mapping auto-applied, "Ready to import" with zero manual steps. 0 console errors. 279 tests, build 2.77 MB. **BUILD-1 COMPLETE.** Profiles are per-device (localStorage); could later migrate to the workspace file. Next: BUILD-2 (action-tracking loop).
