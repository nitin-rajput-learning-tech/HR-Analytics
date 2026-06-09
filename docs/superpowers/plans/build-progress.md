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
- [ ] **BUILD-1 Column-mapping importer** — ✅ s1 mapping engine · ✅ s2a parser override + detectedHeaders · ⬜ s2b mapping UI + preview · ⬜ s3 saved profiles
- [ ] **BUILD-2 Action-tracking loop** — s1 model + persistence · s2 UI panel on HR Brain · s3 newsletter integration
- [ ] **UP-1 Longitudinal trends** — s1 timeseries builder · s2 sparkline component + KPI cards · s3 health-history chart
- [ ] **UP-7 Flight-risk scoring** — s1 feature extraction · s2 weighted explainable score · s3 Brain cohort finding
- [ ] **BUILD-7 Benchmark pack** — s1 loadable pack format + provenance · s2 Scorecard pack picker
- [ ] **BUILD-3 Manager/HRBP cockpit** — s1 manager scoping · s2 cockpit page

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
- [ ] FIX-2 Overflow regression guard
- [ ] FIX-3 Period-diff edge cases
- [ ] FIX-4 Bad-data resilience
- [ ] FIX-5 Print/PDF polish
- [ ] FIX-6 Accessibility deepening
- [ ] FIX-7 Demo realism (resolved finding)

## Log
- **FIX-1 s1** — `normalizeHeader()` (lower-case + unify `_-./` separators + collapse whitespace) applied to both alias-map keys and incoming headers, so real-world export drift matches. New header-drift test + existing Keka round-trip both green. 270 tests, build 2.76 MB.
- **FIX-1 s2** — widened EMPLOYEE_ALIASES with SAP/Workday/ADP synonyms (Staff ID / Personnel Number, Hire Date, Title, Work Location, Company, Sex, Dept, …). New alias test green; FIX-1 complete. 271 tests, build 2.76 MB. Next: BUILD-1 (column-mapping importer).
- **BUILD-1 s1** — `src/core/ingest/mapping.ts`: `suggestColumnMapping` (auto-suggest header→field + unmapped/missing-required gaps) and `validateColumnMapping` (ambiguous/invalid mapping detection). Pure + deterministic, 5 tests. 276 tests, build 2.76 MB. Next: s2 mapping UI + preview (needs browser-verify).
- **BUILD-1 s2a** — `parseWorkbook` now returns `detectedHeaders` (surfaced even on a near-miss) and accepts a `mappingOverride` (header→field|null) that wins over alias detection and bypasses the score threshold. 1 test (rejected→headers surfaced; override→imports). 277 tests, build 2.76 MB. Next: s2b mapping UI (browser-verify).
