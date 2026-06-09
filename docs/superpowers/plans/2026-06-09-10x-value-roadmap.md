# HR Analytics — 10x Value Roadmap

> **For agentic workers:** This is a **roadmap / opportunity catalog**, not a single-feature implementation plan. It spans many independent subsystems. Per `superpowers:writing-plans` scope rules, **each selected item gets its own detailed task-by-task TDD plan before building.** Nothing here is approved to build yet — it is a menu for prioritisation.

**Goal:** Enumerate everything we could Fix, Upgrade, or Build to take the HR Analytics platform from "a very good offline CHRO dashboard with a recommendation engine" to a 10x-more-valuable people-intelligence system — without breaking the offline / no-LLM / single-file / privacy-first posture.

**What "10x" means here:** the platform today *describes and diagnoses* one organisation's current data for one user (the CHRO). The 10x levers are: (1) **Adoption** — make data-in effortless so it's actually used; (2) **Action** — close the loop from recommendation → tracked outcome; (3) **Insight** — move from descriptive to predictive/longitudinal; (4) **Trust** — make comparisons and figures defensible; (5) **Reach** — extend from one CHRO to the whole HR org and multi-entity groups.

**Hard constraints (must hold for every item):** 100% offline · no LLM / no external API · single self-contained build · no real PII leaves the device · deterministic & explainable · white-label.

---

## How to read this

Each item is scored:

- **Lever** — Adoption · Action · Insight · Trust · Reach · Quality
- **Impact** — ★ (nice) → ★★★★★ (transformational)
- **Effort** — **S** (≤1 day) · **M** (2–4 days) · **L** (1–2 wks) · **XL** (multi-week)
- **DoD** — Definition of Done (what "verified" looks like, in this repo's verify → browser-verify → CI rhythm)

Items are grouped **Fix → Upgrade → Build**, then a recommended **First Wave** sequence and an **impact×effort map** close the doc.

---

## A. FIX — defects, gaps, hardening, polish

> Make the existing product trustworthy and resilient on *real* data. These are mostly small, high-confidence, and several are prerequisites for adoption.

### FIX-1 · Ingestion robustness for real, evolving HRMS exports  ★★★★★ · Adoption · **L**
The single biggest real-world gap. Today's parser handles the known Keka shape; real exports drift (renamed/re-ordered columns, blank lead rows, total/footer rows, merged header cells, trailing whitespace, locale number/date formats, multiple sheets, retired columns like the legacy pay-band).
- **Files:** `src/core/ingest/parseWorkbook*`, `src/core/ingest/normalization*`, `src/core/datasets.ts`, `src/core/intake/*`, `src/ui/pages/DataIntake.tsx`.
- **Approach:** widen header detection (fuzzy/aliased column matching from `datasets.ts`), strip blank/footer rows, trim+normalise headers, tolerate empty optional columns, surface a "we mapped X→Y, ignored Z" report. Drive entirely from synthetic fixtures that mimic the quirks + (when available) one real sample.
- **DoD:** new fixtures for each quirk pass; the existing Keka round-trip test still passes; a deliberately messy workbook ingests with a clear mapping/skip report; no regression in `parseWorkbook.test.ts`.
- **Depends on / pairs with:** BUILD-8 (column-mapping UI) is the long-term answer; this is the defensive floor.

### FIX-2 · Overflow / layout regression guard  ★★★ · Quality · **S**
The `min-width:0` overflow bug (just fixed) has no automated guard.
- **Files:** new `scripts/check-layout.mjs` or a Playwright smoke test; wire into `npm run verify` or CI.
- **Approach:** load the built `dist` at 1280/1100/980, assert `documentElement.scrollWidth <= innerWidth+1` on each top-level page.
- **DoD:** the check fails if any page horizontally overflows at the tested widths; green in CI.

### FIX-3 · Period-diff / health-trend edge cases  ★★★ · Insight · **S–M**
Health trend + new/resolved compare current vs the *immediately prior* snapshot. Harden for: only one period (already handled), non-contiguous periods, domains present in one period but not the other (avoid false "new"/"resolved" from coverage gaps, not real change).
- **Files:** `src/core/brain/brain.ts` (the prior-store block), `src/core/scorecard.ts` (`priorStoreOf`), `src/core/brain/context.ts`.
- **Approach:** when a domain is absent in the prior period, mark its findings "coverage-new" (or suppress the NEW badge) rather than implying it newly emerged. Add tests for the mixed-coverage case.
- **DoD:** a finding whose domain had no prior-period feed is **not** falsely flagged NEW; tests cover it.

### FIX-4 · Bad-data resilience & user-facing errors  ★★★ · Adoption/Quality · **M**
Malformed/partial uploads, wrong-domain files, encoding issues, and empty sheets should fail gracefully with a specific, actionable message — never a blank screen or silent drop.
- **Files:** `src/ui/pages/DataIntake.tsx`, `src/core/ingest/*`, error surfaces in `state.tsx`.
- **DoD:** uploading a CSV with the wrong columns, an empty file, and a corrupt xlsx each show a clear message; no uncaught exceptions (verified via browser console).

### FIX-5 · Print / PDF polish for the board pack  ★★★ · Trust · **S–M**
Chrome ignores `@page` margin-box footers, so the printed newsletter lacks page numbers / a running header. The doc-render also tripped on spaces in the output path.
- **Files:** `src/ui/theme.css` (`@media print`), a small print-header component, `src/ui/pages/Reports.tsx`.
- **Approach:** add an in-flow print header (org · period · generated date) and a CSS-counter page footer that the in-app print honours; document the headless-render gotcha.
- **DoD:** print-to-PDF shows org/period header + page numbers; sections still break cleanly (no split cards/tables).

### FIX-6 · Accessibility deepening (keyboard + screen reader)  ★★★ · Quality/Reach · **M**
Contrast passes (25 pairs). Gaps remain: focus management on tab/page change, ARIA live regions for async updates, accessible names/summaries for charts (currently visual only), command-palette keyboard trap review.
- **Files:** `src/ui/*` (focus on route change), chart components, `src/ui/components/*`.
- **DoD:** keyboard-only walkthrough of every page works; charts expose a text summary; an a11y audit (axe) over key pages is clean.

### FIX-7 · Demo realism for period intelligence  ★★ · Quality · **S**
On the demo, "Resolved since last period" and the digest's "0 resolved" never light up (the sample's trajectory only worsens). Seed one prior-period issue that clears this period so the *progress* feature is demonstrable.
- **Files:** `scripts/build-sample-workspace.mjs` (`generatePriorFunctionalMonth`), then `npm run embed-demo`.
- **DoD:** the demo shows ≥1 resolved finding and a non-zero "resolved" in the digest; tests unaffected.

### FIX-8 · Performance & scale (large rosters)  ★★★ · Quality/Reach · **M–L**
Validate and harden for 10k–50k employee rows: parsing time, metric recompute, chart point counts, and especially the Directory table (virtualise rows).
- **Files:** `src/ui/pages/Directory.tsx` (virtualisation), metric builders (memoisation), `scripts/` perf harness.
- **DoD:** a 25k-row synthetic master loads and navigates without jank; a perf budget check is added.

---

## B. UPGRADE — make existing features dramatically better

> Same surfaces, multiplied depth. These turn "good" features into reasons-to-switch.

### UP-1 · Longitudinal trends everywhere (descriptive → temporal)  ★★★★★ · Insight · **L**
The store already holds multiple monthly snapshots; today only "vs last period" is shown. Add **time-series** to every headline KPI: HR Health-score history line, attrition trend, hiring-funnel-over-time, cost-per-head trend, eNPS trend, sparklines on KPI cards and the Scorecard.
- **Files:** new `src/core/metrics/timeseries.ts` (build per-period series from `store.listByKind`), a `<Sparkline>`/trend-chart component, wire into People/Function/Scorecard/Brain.
- **Approach:** reuse `priorStoreOf`-style period reconstruction generalised to *all* periods; pure, tested series builders.
- **DoD:** every headline KPI shows a multi-period trend on the demo (which has ≥2 periods); a "Health over time" chart on HR Brain; tests for the series builders.

### UP-2 · HR Brain rule & depth expansion  ★★★★ · Insight/Action · **M–L**
Add high-value diagnostic rules the data already supports: **key-person / succession risk**, **span-of-control outliers**, **compensation compression & range-penetration**, **overtime/burnout**, **leave & absence anomalies**, **hiring-vs-plan gap** (needs headcount plan, see BUILD-5), **manager-effectiveness signals** (team attrition × engagement × reviews). Plus **per-department Brain** (run the whole diagnosis scoped to one team).
- **Files:** `src/core/brain/brain.ts` (RULES), supporting metrics in `src/core/metrics/*`, `src/core/brain/context.ts`, `src/ui/pages/HRBrain.tsx` (dept selector).
- **DoD:** each new rule has a triggering unit test + a demo-visible finding; per-department mode re-scopes findings; no double-counting in the roadmap/ROI.

### UP-3 · Scenario Planner v2  ★★★★ · Action/Insight · **L**
Today: single-shot hire/cut/move with run-rate + one-time + Year-1. Upgrade to: **multi-month ramp** scenarios, **attrition what-if** (model X% attrition → replacement cost using the existing attrition-economics engine), **comp-raise / promotion** modelling, **budget-vs-plan** overlay, and **save / name / compare** scenarios side-by-side with sensitivity bands.
- **Files:** `src/core/metrics/scenario.ts` (extend the pure engine), `src/ui/pages/Scenario.tsx`, workspace persistence for saved scenarios.
- **DoD:** a saved 12-month ramp scenario reproduces deterministically; attrition what-if reuses `estimateReplacementCost`; compare-view diffs two scenarios; full test coverage on the engine.

### UP-4 · Scorecard v2 — time-bound goals & off-track flags  ★★★ · Action · **M**
Targets become **time-bound goals** (e.g. "review completion ≥95% by Q3"), with variance trend and an **auto "trending to miss"** flag (linear projection from the series). Add saveable **benchmark sets** per sector.
- **Files:** `src/core/scorecard.ts`, `src/core/benchmarks.ts`, `src/ui/pages/Scorecard.tsx`, workspace persistence.
- **DoD:** a KPI moving away from target shows a projected-miss flag; goals persist; tests cover the projection.

### UP-5 · Universal drill-to-evidence  ★★★ · Insight/Trust · **M**
`FINDING_LINKS` deep-links some Brain findings to evidence. Extend so **any** KPI / chart segment / scorecard row → the filtered underlying records (Directory pre-filtered, or the contributing rows).
- **Files:** `src/ui/state.tsx` (goTo + filter payload), chart/table click handlers, `src/ui/pages/Directory.tsx`.
- **DoD:** clicking a KPI opens the Directory filtered to its population; clicking a chart bar filters to that segment.

### UP-6 · Diversity, equity & pay-equity depth  ★★★★ · Insight/Trust · **L**
Beyond headline mix: representation **by level and function over time**, **progression-equity** (promotion/exit rates by group), and a **controlled pay-equity analysis** (explained vs unexplained gap via a simple, transparent local regression on role/level/tenure) — explainable, no black box.
- **Files:** new `src/core/metrics/equity.ts` (deterministic regression), `src/core/metrics/representation.ts`, `pay_equity.ts`, new People sub-tab.
- **DoD:** unexplained-gap figure computed + explained; representation-over-time chart; tests on synthetic data with a known planted gap.

### UP-7 · Transparent attrition / flight-risk scoring  ★★★★★ · Insight · **L–XL**
A local, **explainable** per-employee flight-risk score from features already present (tenure band, comp position/compa-ratio, last rating, manager's team attrition, engagement driver, time-since-promotion). Weighted, transparent, every score shows its contributing factors — decision support, not a black box, no ML service.
- **Files:** new `src/core/metrics/flightRisk.ts`, People "Attrition & Risk" tab, feeds HR Brain (`High Risk` already referenced).
- **DoD:** scores reproduce deterministically; each score lists its top contributors; a Brain finding surfaces the high-risk cohort; tests with planted high-risk profiles.

### UP-8 · Native in-app PDF export & period-comparison newsletter  ★★★ · Trust/Adoption · **M–L**
Replace "use the browser's print" with an in-app **"Export PDF"** button (bundle a print pipeline), and add a **period-comparison** newsletter variant (this month vs last) plus **per-audience** variants (CHRO vs function head).
- **Files:** `src/reports/*`, `src/ui/pages/Reports.tsx`, a client-side PDF approach that keeps the offline/single-file constraint.
- **DoD:** one click downloads a clean PDF identical to print; comparison variant renders deltas; tests on the model.

### UP-9 · White-label / theming depth  ★★★ · Reach · **M**
Full theme editor (accent, surfaces, fonts), logo on print, configurable KPI labels/targets/benchmarks per tenant, exportable "brand profile" file.
- **Files:** `src/ui/pages/Branding.tsx`, `src/ui/theme.css` (CSS variables), workspace/brand persistence.
- **DoD:** a saved brand profile re-skins the whole app + print; round-trips via the workspace file.

### UP-10 · Data lineage & audit trail  ★★★ · Trust · **M**
Every number shows which feed + period it came from; an audit log records uploads, target/benchmark edits, and who/when (local identity).
- **Files:** `src/core/store/*` (provenance tags), an audit-log surface (one exists for some events — generalise), `state.tsx`.
- **DoD:** hovering a KPI shows its source feed/period; the audit log lists uploads + setting changes; persists with the workspace.

---

## C. BUILD — net-new modules / capabilities

> New surfaces that expand what the platform *is*. The biggest multipliers (Adoption, Action, Reach) live here.

### BUILD-1 · Column-mapping importer (the adoption unlock)  ★★★★★ · Adoption · **L**
A guided UI to map *any* spreadsheet's columns to the platform schema, with saved per-source mapping profiles and a live preview. This, more than anything, makes "get your data in" a 2-minute job for any HRMS — the difference between a tool that's tried once and one that's used monthly.
- **Files:** new `src/ui/pages/Import*` or an expanded `DataIntake.tsx`, `src/core/datasets.ts` (mapping model), persistence for mapping profiles.
- **DoD:** map an arbitrarily-headed workbook to the employee schema via the UI, save the profile, re-use it next month; tests on the mapping engine. **Pairs with FIX-1.**

### BUILD-2 · Action tracking / commitment loop  ★★★★★ · Action · **L**
The Brain produces a Now/Next/Later roadmap, but recommendations evaporate. Build a lightweight **action tracker**: assign each roadmap item an owner, status, due date, and notes; next period the Brain shows "committed vs done," and the newsletter reports follow-through. This is what turns analytics into outcomes — the core of the "10x."
- **Files:** new `src/core/actions/*` (model + persistence), `src/ui/pages/Actions*` or panels on HR Brain, newsletter integration, workspace persistence.
- **DoD:** create/assign/close an action; it survives a workspace save/reload; the newsletter lists open vs closed; tests on the model.

### BUILD-3 · Manager / HRBP cockpit  ★★★★ · Reach · **L**
A per-manager or per-HRBP view: their team's health, attrition, open reviews, flight-risk, and the actions assigned to them. Extends the platform from one CHRO to the entire HR org — a large multiplier on users and impact.
- **Files:** new `src/ui/pages/Cockpit*`, scoping logic over existing metrics (reuse People/Brain scoped to a manager's reports), filters.
- **DoD:** pick a manager → see their team's scoped dashboard + assigned actions; tests on the scoping.

### BUILD-4 · Compliance & renewals calendar  ★★★★ · Action · **M**
The Brain already flags statutory lateness, contract renewals, and mandatory-training gaps reactively. Build a unified **forward calendar**: statutory due dates, contract expiries (30/60/90), training deadlines, lifecycle checklist SLAs — proactive, with a "next 30 days" digest in the newsletter.
- **Files:** new `src/core/metrics/calendar.ts` (aggregate dated obligations), `src/ui/pages/Calendar*`, newsletter block.
- **DoD:** a unified upcoming-obligations list with horizons; demo shows real entries; tests on the aggregation.

### BUILD-5 · Headcount planning module  ★★★★ · Insight/Action · **L**
A bottoms-up plan: planned vs budgeted vs actual headcount by department/quarter. Unlocks **hiring-vs-plan** analytics (a Brain rule), feeds the Scenario Planner, and anchors the Newsletter's growth narrative.
- **Files:** new dataset kind (`headcount_plan`) in `datasets.ts`, `src/core/metrics/plan.ts`, intake template, a planning page, Brain rule.
- **DoD:** upload/enter a plan; see plan vs actual variance; a Brain finding fires on material under/over-hiring; tests.

### BUILD-6 · Compensation review module  ★★★★ · Insight/Action · **L–XL**
Comp bands, compa-ratio distribution, range penetration, pay-equity remediation modelling, and a **merit-cycle simulator** (budget × matrix → projected spend + equity impact). Highly board-relevant and a natural sibling to Scenario/Scorecard.
- **Files:** new `src/core/metrics/comp.ts`, payroll feed extensions, a Comp page, Scenario integration.
- **DoD:** compa-ratio distribution + a merit-cycle simulation that respects a budget; tests on the simulator.

### BUILD-7 · Curated benchmark data pack (trust unlock)  ★★★★ · Trust · **M**
Ship an optional, **sourced** benchmark dataset (by sector / region / company size) as a loadable data file, replacing the "illustrative" bands with credible, cited references — turning a caveat into a selling point. Keeps the offline posture (it's a static file, not a service).
- **Files:** `src/core/benchmarks.ts` (loadable packs + provenance), a benchmark-pack file format, Scorecard UI to pick a pack.
- **DoD:** select a sector pack → Scorecard bands update with visible sourcing; falls back to illustrative when none chosen; tests.

### BUILD-8 · Multi-entity / group rollup  ★★★ · Reach · **L**
Consolidate multiple legal entities or business units into a group view with drill-down and inter-entity comparison — essential for conglomerates/groups (the airpay multi-entity reality).
- **Files:** store/aggregation layer for multiple entity workspaces, a group dashboard, comparison views.
- **DoD:** load two entities → see consolidated + per-entity + comparison; tests on the rollup.

### BUILD-9 · Local "explore / pivot" query builder  ★★★ · Insight · **M–L**
A deterministic, no-LLM pivot/explore tool: slice any metric by any dimension (department × level × gender, etc.), with export. Answers the long tail of ad-hoc CHRO questions without code.
- **Files:** new `src/core/query/*` (a typed group-by/aggregate engine over the snapshot), an Explore page.
- **DoD:** build a 2-dimension pivot in the UI, export to CSV; tests on the aggregation engine.

### BUILD-10 · Board-pack builder  ★★★ · Trust/Adoption · **M–L**
Turn the fixed Newsletter into a customisable deck: reorder/toggle sections, add free-text commentary blocks, brand it, export. Makes the board pack *theirs*.
- **Files:** `src/reports/*`, a pack-builder UI, persistence for pack layouts.
- **DoD:** reorder sections + add a commentary block + export; layout persists; tests on the model.

---

## D. Recommended "First Wave" (the genuine 10x core)

If the goal is maximum value per unit effort, do these **in this order** — they compound (adoption → action → insight → trust):

1. **FIX-1 + BUILD-1 (Ingestion robustness + column-mapping importer).** Nothing else matters if data-in is hard. *Adoption.* — pair them.
2. **BUILD-2 (Action tracking / commitment loop).** Converts the Brain's recommendations into managed, tracked outcomes — the descriptive→operational leap. *Action.*
3. **UP-1 (Longitudinal trends everywhere).** The store already has the history; surfacing it is high-impact, moderate effort. *Insight.*
4. **UP-7 (Transparent flight-risk scoring).** The headline predictive capability, fully explainable. *Insight.*
5. **BUILD-7 (Curated benchmark pack).** Cheap-ish, turns the biggest credibility caveat into a strength. *Trust.*
6. **BUILD-3 (Manager/HRBP cockpit).** Multiplies the user base from one CHRO to the whole HR org. *Reach.*

Quick wins to slot in alongside (all **S**): FIX-2 (regression guard), FIX-7 (demo realism), FIX-3 (period-diff edge cases).

---

## E. Impact × Effort map

| Item | Lever | Impact | Effort |
|---|---|---|---|
| FIX-1 Ingestion robustness | Adoption | ★★★★★ | L |
| BUILD-1 Column-mapping importer | Adoption | ★★★★★ | L |
| BUILD-2 Action tracking loop | Action | ★★★★★ | L |
| UP-1 Longitudinal trends | Insight | ★★★★★ | L |
| UP-7 Flight-risk scoring | Insight | ★★★★★ | L–XL |
| UP-2 HR Brain rule expansion | Insight/Action | ★★★★ | M–L |
| UP-3 Scenario Planner v2 | Action/Insight | ★★★★ | L |
| UP-6 Equity & pay-equity depth | Insight/Trust | ★★★★ | L |
| BUILD-3 Manager/HRBP cockpit | Reach | ★★★★ | L |
| BUILD-4 Compliance calendar | Action | ★★★★ | M |
| BUILD-5 Headcount planning | Insight/Action | ★★★★ | L |
| BUILD-6 Compensation module | Insight/Action | ★★★★ | L–XL |
| BUILD-7 Benchmark data pack | Trust | ★★★★ | M |
| UP-4 Scorecard goals/off-track | Action | ★★★ | M |
| UP-5 Universal drill-down | Insight | ★★★ | M |
| UP-8 Native PDF + comparison | Trust/Adoption | ★★★ | M–L |
| UP-9 White-label depth | Reach | ★★★ | M |
| UP-10 Data lineage & audit | Trust | ★★★ | M |
| BUILD-8 Multi-entity rollup | Reach | ★★★ | L |
| BUILD-9 Explore/pivot builder | Insight | ★★★ | M–L |
| BUILD-10 Board-pack builder | Trust/Adoption | ★★★ | M–L |
| FIX-8 Performance & scale | Quality/Reach | ★★★ | M–L |
| FIX-5 Print/PDF polish | Trust | ★★★ | S–M |
| FIX-4 Bad-data resilience | Adoption/Quality | ★★★ | M |
| FIX-6 Accessibility deepening | Quality/Reach | ★★★ | M |
| FIX-3 Period-diff edge cases | Insight | ★★★ | S–M |
| FIX-2 Overflow regression guard | Quality | ★★★ | S |
| FIX-7 Demo realism | Quality | ★★ | S |

---

## F. Risks & guardrails (apply to every item)

- **Keep it offline & deterministic.** Flight-risk (UP-7), pay-equity regression (UP-6), and comp simulation (BUILD-6) must be transparent local computation — every output shows its inputs. No LLM, no service.
- **Don't break the working ingestion path.** All ingestion work (FIX-1, BUILD-1) is additive + fixture-driven; the existing Keka round-trip test is the safety net.
- **Single-file build budget.** New modules must keep `dist/index.html` under the 4 MB budget (`check:size`); large benchmark packs (BUILD-7) load as separate optional files, not bundled.
- **Privacy.** Anything per-employee (flight-risk, cockpit) stays local; nothing is transmitted; saved workspaces stay encryptable.
- **Verification rhythm.** Every item follows this repo's `verify (typecheck/test/build/size/a11y) → browser-verify in Chrome → commit → CI-green` loop, with pure, tested core builders separated from UI.

---

## Next step

Nothing here is built yet (as instructed). **Pick the item(s) you want to pursue** and I'll turn each into a full `superpowers:writing-plans` implementation plan — file-by-file, bite-sized TDD tasks with exact code, commands, and commits — saved alongside this roadmap. My recommendation is to start with the **First Wave** (§D): FIX-1 + BUILD-1 together, then BUILD-2.
