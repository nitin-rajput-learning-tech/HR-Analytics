# Airpay HR Analytics — Enterprise Product Strategy

*Prepared for the product leadership review · June 2026 · Status: candid internal assessment*

---

## 1. Executive Summary

**Where we are.** Airpay HR Analytics is a genuinely well-built, single-file, fully offline people-analytics product. A pure, DOM-free analytics core (`src/core`) — a 13-kind dataset registry, an in-memory snapshot store, per-domain `compute() → DomainMetrics`, a snapshot-diff movement/forecast model, and a deterministic rule-based narrative engine — sits cleanly under a thin React/Plotly UI and a deterministic CHRO newsletter. The whole thing ships as one ~7 MB `dist/index.html` with **zero** network calls, no server, and PII that never leaves the browser tab. The analytical depth on people data (8 sections with KPIs, drill-down charts, breakdown tables *and* threshold watch-outs) is well above prototype grade. The audit scores us 3/5 on architecture, feature breadth and data model; 2/5 on analytics methodology; and **1/5 on enterprise readiness** — no auth, no RBAC, no audit trail, no real persistence, no connectors, near-zero accessibility, no CI.

**The opportunity.** Every serious competitor — Visier, Workday, SAP/Oracle, Microsoft Viva, Culture Amp, ChartHop/Lattice, One Model/Crunchr, the Big 4 — is **cloud-only, enterprise-priced, integration-heavy, and increasingly LLM-driven**. They are unanimously strong above ~1,000 employees and unanimously absent below it. They all require shipping employee PII into a vendor cloud, an 8-week-to-18-month implementation, and per-employee SaaS fees. That leaves a large, under-served, structurally defensible segment: **privacy-constrained, India-data-residency, air-gapped, cost-sensitive SMB/mid-market buyers, and the HR consultancies/PEOs who serve them** — buyers the incumbents price out or scare off on a security review.

**The wedge.** We are not a smaller Visier. We are the *opposite* of Visier on the axes that matter to this segment: **offline, zero-egress, zero-infrastructure, deterministic (no LLM, fully auditable), single-file portable, white-label, India-native.** No incumbent can follow us here without abandoning their architecture and business model. Our job is to (a) make those properties an explicit, evidenced sales argument, (b) close the *credibility* table-stakes (accessibility, workspace encryption, an audit log, CI) that today disqualify us on sight, and (c) ship the two or three analytics features (scenario sandbox, pay-equity, deterministic attrition risk) that an in-browser app *can* do and that turn "cheap offline reporting" into "a board-ready decision tool."

---

## 2. Honest Assessment — Where We Stand vs the Market

### Parity or genuine advantage
| Capability | Verdict | Evidence |
|---|---|---|
| Descriptive people analytics (headcount, tenure, diversity, geography, span, pending exits, data quality) | **At parity / often deeper** than a typical dashboard | `people.ts` ships 8 sections with KPIs + drill charts + tables + watch-outs |
| Deterministic monthly narrative / CHRO newsletter | **Differentiated** — incumbents do this with LLMs (Workday Illuminate, Visier Vee) | `src/core/narrative.ts`, `src/reports/newsletter.ts` — auditable, reproducible, zero hallucination |
| Zero-config trending via snapshot diff (joiners/leavers, forecast) | **Clever and genuinely ours** | `movement.ts` `deriveEmployeeEvents` — no events table required |
| White-label / re-brand | **Real and working** | `branding.ts` theme export/import, hex validation, presets, logo data-URI |
| Privacy / zero-egress | **Architecturally true, not marketing** | grep confirms no `fetch`/XHR/telemetry; persistence is a user-held `.gz` only |
| Time-to-value | **Best in class** | open one HTML file, load a CSV → KPIs + brief in minutes vs 8 weeks–18 months |

### Real gaps vs the market
| Capability | Verdict | Reality |
|---|---|---|
| Auth / SSO / RBAC / multi-user / audit | **Absent** | Single React context, one `MemoryStore`; "whoever holds the file holds the data" |
| External benchmarking | **Structurally impossible offline** | Visier's ~250M benchmarks / Culture Amp's 6,000-company panel are a network-effect moat |
| Predictive ML (flight risk, survival, promotion) | **Absent** | We have a recency-weighted mean + OLS slope mislabeled a "confidence band" |
| Statistical rigor | **Thin** | Means only — no median/percentile/dispersion; cross-functional score is unstable min-max |
| Engagement / sentiment / ONA | **Out of scope** | We measure the system of record, not how people feel |
| Connectors (Workday/SuccessFactors/HRIS) | **Absent by design** | Manual `.xlsx` only; not even CSV ingest yet |
| Scenario / workforce planning | **Absent** | `headcount_plan` and `target_join_date` fields exist but are never modeled |
| Accessibility (WCAG 2.1 AA) | **Failing** | ~7 aria/role/alt attributes total; `href="#"` nav; no focus management |
| Functional-domain trending | **People-only** | TA/PMS/Payroll/L&D/Ops compute from a single latest snapshot |
| Engineering governance | **Absent** | No CI/`.github`, version still `0.1.0`, ad-hoc `verify*.cjs` quality gates |

**The honest one-liner:** we are a *polished single-user analyst-in-a-file*, not enterprise software — and that is fine, **if** we stop pretending the gap above is closeable in-browser and instead make our wedge undeniable while fixing the handful of credibility blockers that are genuinely cheap to fix.

---

## 3. Differentiators — Durable Moat vs Nice-to-Have

| Differentiator | Classification | Reasoning |
|---|---|---|
| **Offline / zero-egress (PII never leaves the tab)** | **DURABLE MOAT** | This is *architectural*, not a feature. Every competitor's business model requires cloud ingestion; replicating "offline" means abandoning their SaaS revenue, benchmark network effects, and live-refresh pitch. Directly answers India DPDP (penalties to ₹250 cr), GDPR, works-council, and air-gap mandates that **block** cloud ONA/pay tools. They cannot follow. |
| **Zero-infrastructure / instant deploy** | **DURABLE MOAT (paired with offline)** | One `dist/index.html` on SharePoint/USB vs 8-week–18-month implementations with data-engineering projects. The incumbents' enterprise motion *cannot* compress to "open the file." Durable because it's the same architectural fact as offline. |
| **Deterministic, no-LLM narrative** | **DURABLE-ISH MOAT** (a deliberate stance, defensible) | Reproducible, auditable, "every sentence traces to a number" — a real trust argument as the EU AI Act marks HR as high-risk (Annex III) and GenAI hallucination (cited 20–60%) spooks legal/compliance. *Durable as positioning*; the risk is buyers come to *want* conversational Q&A. We keep it a moat by owning "explainable-by-construction," not by refusing all interactivity. |
| **Single-file portability** | **DURABLE MOAT** | A gzipped workspace you email/USB/save-forever is a fundamentally different ownership model than a locked SaaS tenant. Underpins the consultant/white-label channel. Tied to the same architecture, so it's durable. |
| **White-label / OEM** | **NICE-TO-HAVE → STRATEGIC ENABLER** | The mechanism (`branding.ts`) is trivially copyable by anyone, so it is **not** a moat alone. But combined with single-file portability it unlocks a *distribution* moat: consultancies/PEOs reselling under their own brand — something tenant-locked suites structurally can't offer. Value is in the channel, not the hex picker. |
| **India context (INR, lakh/crore grouping, India HR-ops framing)** | **NICE-TO-HAVE (defensible niche, not a moat)** | Cheaply copyable by any vendor who decides India matters, but the incumbents demonstrably *haven't* — it's a real wedge **today** for the under-served India mid-market. Treat as a beachhead, not a fortress. |

**Synthesis:** the durable moat is the *bundle* — offline + zero-infra + single-file + deterministic — because all four fall out of one architectural choice the incumbents can't make without self-cannibalizing. White-label and India are the **go-to-market amplifiers** that turn that moat into a reachable, monetizable segment.

---

## 4. Gap Analysis — Table-Stakes We Lack to Be Credible at Enterprise Level

These are the things that get us **disqualified on a checklist before the demo**, ordered by how often they kill a deal. Note which are *genuinely closeable in-browser* vs *require a server tier*.

| Table-stake | Status | In-browser feasible? | Why it blocks us |
|---|---|---|---|
| Workspace encryption at rest | Missing | **Yes** (passphrase → WebCrypto AES-GCM) | A plaintext `.gz` of full employee PII fails any security review; trivially fixable |
| Audit / activity log | Missing | **Partly** (local action log embedded in workspace) | "Who viewed/edited/exported" is a hard procurement gate; a *local* log is honest and cheap |
| Accessibility (WCAG 2.1 AA) | Failing | **Yes** | Hard gate for enterprise + all public-sector/government buyers |
| CI + versioning + SBOM | Missing | **Yes** | Security teams read "no CI, v0.1.0, ad-hoc scripts" as immaturity |
| Workspace schema versioning/migration | Missing (`version:1` ignored) | **Yes** | Without it, every schema change silently breaks old saved files — a data-integrity red flag |
| CSV ingest + import validation/preview | Missing (xlsx-only, pass/fail) | **Yes** | "xlsx only, no row-level errors" reads as low-assurance to non-technical HR |
| Row-level validation + referential integrity | Advisory only | **Yes** | Enum `allowed` lists declared but never enforced; orphan FKs silently ignored |
| SSO / SAML / SCIM | Missing | **No — needs server** | Mandatory for true enterprise; **concede this** and don't pitch against it |
| RBAC / multi-tenant / multi-user | Missing | **No — needs server** | Same — out of scope for the single-file edition |
| External benchmarking | Missing | **No — needs a panel/network** | Structural; *partially* mitigable via manual benchmark overlays |
| Predictive ML + explainability (SHAP) | Missing | **Partly** (deterministic risk index in-browser; optional WASM model) | We can deliver *explainable-by-construction* risk without the black box |
| Functional-domain MoM trending | People-only | **Yes** (extend `decoratePeopleDeltas`) | Enterprise expects every KPI to trend, not just headcount |
| SOC2 / ISO / DPDP-GDPR attestations | None | **Process, not code** | We can ship a *governance one-pager* that leans into zero-egress while listing gaps honestly |

**The strategic read:** the left two-thirds of this list is **cheap and in-browser** — and closing it moves us from "1/5, disqualified" to "credible privacy-first SMB/mid-market product." The bottom (SSO/RBAC/multi-tenant/benchmarks) is **architecturally out of scope** for the offline edition; we should *concede it loudly and honestly* rather than fail silently, and reserve it for an optional future server tier.

---

## 5. Prioritized Roadmap — Three Tiers

Impact/Effort are H/M/L. The "Architecture note" maps each item to **actual** modules so estimates are real, not aspirational.

### Tier 1 — Parity table-stakes (earn the right to be evaluated)
| # | Item | Impact | Effort | Architecture note |
|---|---|---|---|---|
| 1.1 | **Encrypt workspace at rest** (passphrase, WebCrypto AES-GCM) | H | L | Wrap `saveWorkspace`/`loadWorkspace` in `workspace.ts`; encrypt the `pako.gzip` output, prepend a salt/IV header. Pure addition, no UI rewrite. |
| 1.2 | **WCAG 2.1 AA pass** | H | M | `theme.css` (`:focus-visible`, contrast), `AppShell.tsx` (`href="#"` → `<button>`), roving-tabindex tab strips/`FilterBar.tsx`, focus trap in `CommandPalette.tsx`. UI-layer only; core untouched. |
| 1.3 | **CI + versioning + SBOM** | H | L | Add `.github/workflows` running `npm ci`/typecheck/`scripts/test.mjs`, a `dist/index.html` size-budget gate, `.nvmrc`; fold `verify*.cjs` into the suite; bump `package.json` off 0.1.0. |
| 1.4 | **Workspace schema versioning + migration ladder** | H | L | Use the already-present `WorkspaceFile.version` in `workspace.ts`; persist a registry hash, warn (don't silently bind) on drift, write a migration step per `datasets.ts` change. |
| 1.5 | **CSV ingest + pre-import preview + row-level validation** | H | M | Relax `accept=".xlsx"` in `DataIntake.tsx`; reuse `parseWorkbook.ts` alias-matching + `coerce.ts`; enforce `field.allowed` enums; extend `SnapshotCandidate` with per-row issues + downloadable rejected-rows report. |
| 1.6 | **Local audit/action log embedded in workspace** | M | L | Append `{ts, action, kind}` entries to a new `WorkspaceFile.auditLog`; surface read-only in UI. Honest, offline-compatible audit. |
| 1.7 | **Functional-domain MoM deltas** | M | M | Mirror `decoratePeopleDeltas` (`compare.ts`) across `metrics/index.ts` domains so TA/PMS/Payroll/L&D/Ops KPIs trend — history already in the store. |
| 1.8 | **Referential-integrity check at commit** | M | M | Validate `employee_number`/`program_id` against latest `employee_master`; emit a data-quality watch-out onto the existing insights banner instead of silently dropping. |
| 1.9 | **Performance hardening for SMB ceiling** | M | M | Memoize per-snapshot `buildPeople` keyed by snapshot id + filters and debounce search (`People.tsx`); push parse + compute into a Web Worker; document the supported scale (~5–10k employees × ~24 months). |

### Tier 2 — Differentiators (turn the wedge into product)
| # | Item | Impact | Effort | Architecture note |
|---|---|---|---|---|
| 2.1 | **Offline scenario / what-if sandbox** | H | M | Treat a scenario as another `Snapshot` kind in `MemoryStore`; clone the latest `employee_master`, allow add/remove/move roles, recompute headcount + INR cost + span/layer deltas via the existing `people.ts` + `compare.ts` diff path. **Our single biggest gap-to-differentiator.** |
| 2.2 | **Deterministic attrition-risk index (explainable-by-construction)** | H | M | New `metrics/risk.ts → compute(): DomainMetrics`. Transparent weighted score over data we already hold (tenure band, time-since-promotion via `pms_review`, comp-vs-band gap via payroll, overtime, span). Each employee's score breaks down into named contributors — that *is* the explainability. |
| 2.3 | **Deterministic pay-equity module** | H | M | New domain via `metrics/index.ts` dispatcher; rule-based gap detection by gender/location/grade off `payroll_record` + `employee_master`, with a built-in "EU >5% unexplained-gap" flag and remediation-cost simulator. Rides the EU Pay Transparency Directive (transposition due 7 Jun 2026). |
| 2.4 | **Honest forecast + distribution stats** | H | M | In `movement.ts`: stop calling ±10% a "confidence band" (relabel scenario band or add residual/bootstrap intervals); fix attrition denominator to average headcount; add median/p25/p75 alongside means in `people.ts`/`pms.ts`. Low-effort credibility. |
| 2.5 | **Configurable, tenant-specific thresholds/targets** | M | M | Lift hardcoded literals (attrition 0.2/0.3, early-tenure 0.45, female 12%, span 15, risk 50/65) into a typed config driven from `branding.ts`/settings, with India defaults. Lets customers set their own "good/bad." |
| 2.6 | **Registry-driven domain metrics** | M | M | Replace the hardcoded `switch` in `metrics/index.ts` with a `{requiredKinds, compute}` map keyed off `datasets.ts`, so a new domain is a schema entry + a metrics module — realize the extensibility the data layer already promises. |
| 2.7 | **Manual benchmark overlay** | M | L | Let users paste public figures (Saratoga Impact / industry medians) as a target line on charts and a delta in KPIs — chips at the benchmark moat without a central database. |
| 2.8 | **Offline eNPS / engagement-survey CSV import** | M | M | New schema in `datasets.ts` + a `metrics/engagement.ts`; compute index/drivers/heatmap locally and add a "sentiment vs attrition" cross-tab — closes Culture Amp/Glint's one clear edge without becoming a cloud listening platform. |
| 2.9 | **Lazy-mount newsletter chart sections** | M | L | `IntersectionObserver` in `Reports.tsx` so the heaviest render path doesn't instantiate every Plotly figure at once before `window.print()`. |
| 2.10 | **Bundle shrink (partial Plotly build)** | M | M | Replace `plotly.js-dist-min` (4.56 MB) with a custom build of only bar/scatter/pie/funnel (the 5 kinds `charts.ts` emits); gzip-serve `dist/index.html`. Multi-MB cut on a 7 MB file. |

### Tier 3 — Moonshots (new surface area / new editions)
| # | Item | Impact | Effort | Architecture note |
|---|---|---|---|---|
| 3.1 | **Optional in-browser ML (opt-in)** | M | H | WASM XGBoost / TF.js logistic regression "train on my own history" for attrition — ~96% of native accuracy, sub-7ms inference, no data leaves the tab. Keep **opt-in**; deterministic stays the default so the trust pitch holds. |
| 3.2 | **Survival / time-to-attrition curves** | M | H | Deterministic Kaplan-Meier / hazard from the snapshot history we already store → "expected exits next 1/3/6 months" per cohort, no training-data minimum. Extends `movement.ts`. |
| 3.3 | **IndexedDB persistence + lazy per-domain load** | M | H | Break the all-or-nothing `JSON.parse` cliff in `workspace.ts`/`MemoryStore`; persist snapshots to IndexedDB, lazy-load rows per domain. Buys headroom toward larger orgs without abandoning offline. |
| 3.4 | **Optional server "Enterprise Edition" tier** | H | H | Wrap the *already framework-agnostic* `src/core/metrics/*` behind a server with SSO/SAML+SCIM, RBAC, per-tenant isolation, append-only audit, encrypted persistence. The spec's anticipated "Phase B" — additive, not a rewrite. Only fund if enterprise is a strategic target. |
| 3.5 | **Anonymized opt-in benchmark exchange** | M | H | Export/import de-identified aggregate KPIs between deployments to seed peer comparison without a central PII store — a privacy-preserving stab at the one true moat we lack. |
| 3.6 | **Survey-free "org/collaboration" view** | L | M | Derive bridge/span/cross-unit-movement signals from reporting lines already in `employee_master` — ONA-flavored insight with zero surveillance/consent exposure. |

---

## 6. Next 6 Concrete Features to Build

These are the immediate build queue — chosen for the best ratio of (deal-unblocking or differentiation) to (effort), and all genuinely in-browser.

**1. Encrypted, versioned workspace (T1.1 + T1.4).**
Wrap `saveWorkspace`/`loadWorkspace` in `src/workspace/workspace.ts` with an optional passphrase: derive a key (PBKDF2/Argon2 via WebCrypto), AES-GCM-encrypt the existing `pako.gzip(JSON.stringify(payload))` output, and prepend a small header `{format, version, salt, iv, encrypted:true}`. In the same pass, actually *use* the dormant `WorkspaceFile.version` field: persist a hash of the `datasets.ts` registry, and on load compare it — migrate forward through a small ladder or warn loudly instead of silently mis-binding columns. This closes the single most glaring security-review objection ("plaintext PII file") and the data-integrity objection ("no migration story") together, touching only `workspace.ts` and a thin `AppShell.tsx` passphrase prompt.

**2. Accessibility AA pass (T1.2).**
A focused sweep of the UI layer, leaving `src/core` untouched. In `src/ui/theme.css` add `:focus-visible` styling and validate brand-color contrast (warn in `branding.ts` when `primary`/`accent` fail AA on the chosen `theme`). In `src/ui/AppShell.tsx` replace `href="#"` nav anchors with real `<button>`s. Add roving-tabindex / arrow-key navigation to the tab strips and `src/ui/components/FilterBar.tsx` facets, a focus trap + consistent Esc handling to `src/ui/components/CommandPalette.tsx` and the views/filter popovers, and `aria-label`s to icon-only PNG/CSV/dismiss buttons. This removes a hard procurement gate for enterprise and *every* public-sector buyer.

**3. Offline scenario / what-if sandbox (T2.1).**
The flagship differentiator. Add a `scenario` snapshot kind that clones the latest `employee_master` snapshot in `MemoryStore` (snapshots are already keyed by `s.id`, so a scenario is just `employee_master:scenario-<name>`). Build a lightweight editor that lets a user add/remove/move roles and edit comp; then reuse the existing `people.ts` `compute()` and `compare.ts` delta machinery to render headcount, span-of-control, layer, and **INR cost** deltas of *plan vs actual* instantly, in-tab, with our existing Indian number formatting. The scenario lives inside the gzipped workspace, so a CHRO emails a reorg what-if to the CFO with zero seats and zero cloud — directly countering Anaplan/ChartHop/orgvue's headline feature without their price or data exposure. Finally, feed the scenario into `src/reports/newsletter.ts` as a forward-looking "if we execute this plan" section with owner-tagged actions.

**4. Deterministic attrition-risk index (T2.2).**
A new pure module `src/core/metrics/risk.ts` exporting `compute(): DomainMetrics` so it renders through the existing `DomainView`/`Chart` path and the newsletter with no UI plumbing. Compute a transparent, weighted, logistic-style 0–100 risk score per employee over signals we already hold — tenure band and time-since-joining (`employee_master`), time-since-promotion and rating dips (`pms_review`), comp-vs-band gap and overtime (`payroll_record`), and manager span (`people.ts`). Crucially, surface each employee's score as a **breakdown of named contributors** ("+18 long tenure without promotion, +12 below-band comp") — that decomposition *is* our explainability, and for HR defensibility it beats a black-box SHAP overlay. Keep it deterministic (no LLM) so it stays board-defensible and AI-governance-free.

**5. Deterministic pay-equity module (T2.3).**
Register a new pay-equity domain in the `src/core/metrics/index.ts` dispatcher (and, ideally, do this as the first consumer of the registry-driven refactor in T2.6). Join `payroll_record` to `employee_master` and run rule-based pay-gap detection by gender × location × grade, with a built-in "**EU >5% unexplained-gap**" flag and a remediation-cost simulator (how much to close each cohort's gap). Output the standard `DomainMetrics` (KPIs + a gap chart + a cohort table + watch-outs onto the insights banner). This rides a hard regulatory tailwind (EU Pay Transparency Directive transposition due 7 June 2026; India/US pay-transparency momentum) and delivers a *defensible, explainable* pay-equity artifact without a regression black box or any cloud upload — exactly the privacy posture Syndio/Trusaic/PayAnalytics can't match.

**6. Honest forecast + distribution statistics (T2.4).**
A credibility fix that's mostly relabeling and arithmetic, concentrated in `src/core/metrics/movement.ts`. Stop describing the hardcoded ±10% flex as a "confidence band" in both code and `movement.test.ts`; either relabel it explicitly as a deterministic *scenario* band (with the assumption documented) or replace it with residual-based / bootstrap prediction intervals from a tiny backtest. Fix `annualisedAttrition` to use average headcount `(begin+end)/2` instead of current active, expose a true trailing-12-month rate once enough snapshots exist, and suppress/flag annualisation when months < 3. In parallel, add median and p25/p75 alongside the means in `people.ts` (tenure, span) and `pms.ts` (rating) — low effort, materially more credible on skewed HR distributions, and it pre-empts the auditor's "you only report averages" critique.

---

## 7. Positioning & Go-To-Market

### One-line positioning
> **"The privacy-first analyst-in-a-file: board-ready HR analytics and a deterministic CHRO newsletter that run entirely offline — no cloud, no integration project, no per-employee fee. Your data never leaves the tab."**

### vs the Big 4 (PwC Saratoga, Deloitte, EY, KPMG) — *productized self-serve vs consulting + dashboards*
The Big 4 sell **billable hours, decks, and benchmark studies** with steep fees, multi-year memberships, and "insights by week six" *at best*; both Saratoga (submit your PII into the study) and Deloitte/EY/KPMG (connect your HR data ecosystem) require **data to leave the building**. We counter-position on three axes:
- **Productized, not project-based.** Open the file, load a CSV, get the newsletter *today* — a repeatable monthly cadence (MoM deltas, owner-tagged action plan) vs episodic engagements.
- **Zero-egress turns their multi-month security review into a non-issue.** "Your PII never leaves the tab" directly defeats the data-submission/connection requirement.
- **Deterministic vs GenAI black box.** Every newsletter sentence is rule-traceable — safe for compliance/works-council/regulated buyers wary of Deloitte's GenAI suite.
- **Channel play:** sell **white-label** so Indian HR consultancies/SIs resell our newsletter engine under their own brand — productizing what the Big 4 bill hourly, to clients who can't afford them. Concede benchmarking honestly and offer the *manual benchmark overlay* (paste public Saratoga Impact figures) as the bridge.

### vs Visier / Workday / SAP-Oracle / Viva / Culture Amp — *privacy-first, no-infra, white-label, instant deploy*
These are category leaders **above ~1,000 employees**, cloud-mandatory, $5–38 PEPM (Oracle floors at 1,000 licenses / ~$180k/yr), 8-week-to-18-month implementations, and increasingly LLM-fronted (Vee, Illuminate, Joule). We do **not** fight them on benchmarks, ML, connectors, or scope — we'd lose. We win where their architecture *can't go*:
- **Privacy/sovereignty wedge:** the exact opposite of cloud ingestion + zero-copy-to-Snowflake — built for India DPDP/data-residency, air-gapped, and security-paranoid buyers.
- **Time-to-value & TCO:** minutes vs months; a one-file artifact with no seats, no gateways, no annual commitment vs per-employee SaaS.
- **No system-of-record required:** we run on any employee-master CSV, so non-Workday/multi-HRIS and SMB shops get instant analytics the suites structurally can't serve below their price floor.
- **Deterministic-as-trust:** explainable, reproducible narratives as the safe alternative to probabilistic copilots — landing precisely with the HR/legal teams resisting GenAI.

### Beachhead and motion
1. **Primary beachhead:** India SMB/mid-market HR teams (≤ ~5–10k employees) priced out and scared off by cloud suites — INR/lakh-crore formatting and zero-IT setup are the hook.
2. **Force multiplier:** HR consultancies, PEOs, fractional CHROs, and payroll/HRMS vendors who **resell white-labeled** to many clients — a portable monthly deliverable per client.
3. **Niche knockout deals:** M&A/due-diligence reviewers and air-gapped/regulated orgs (defense, BFSI, public sector) for whom "PII never leaves the tab" is the *only* acceptable answer.
4. **Sales asset:** ship a **security/compliance one-pager + SBOM** that leans into the offline posture (no egress, no server attack surface, deterministic no-AI) while transparently listing gaps (no SOC2/ISO yet) — let security teams self-qualify instead of disqualifying on silence.

---

## 8. Key Risks & Mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **The offline stance caps the market.** Same architecture that's our moat blocks SSO/RBAC/multi-user/audit and *every* true-enterprise RFP — and limits scale to an SMB-shaped ceiling (degrades past ~25–50k rows; `MemoryStore` + single `JSON.parse` cliff). | High | **Segment the sale honestly:** position as the privacy-first SMB/mid-market + consultant edition; do **not** pitch against cloud suites on enterprise checklists we structurally fail. Reserve SSO/RBAC for an optional server "Enterprise Edition" (T3.4) that reuses the framework-agnostic core. Document the supported scale and gate ingestion with a row-count warning (T1.9). |
| 2 | **No-LLM means no conversational Q&A** while every competitor ships a copilot (Vee, Illuminate, Joule) — buyers may come to expect natural-language interaction. | Medium-High | **Reframe deterministic as the feature, not the gap:** "explainable-by-construction, hallucination-free, AI-governance-free." Match the *value* of NL narratives with the deterministic newsletter + command palette. If demand hardens, add an **opt-in, on-device** assistant later (keep deterministic the default) — never cloud LLM, which would break the egress promise. |
| 3 | **No external benchmarking** — a genuine network-effect moat (Visier ~250M records, Culture Amp 6,000 companies) we can't replicate offline. | Medium | Concede it openly; offer the **manual benchmark overlay** (T2.7) and an optional **anonymized opt-in exchange** (T3.5). Sell internal-trend depth (MoM deltas, scenario, risk) as the everyday value; benchmarks are episodic. |
| 4 | **Analytics-methodology credibility** — a mislabeled "confidence band," means-only stats, an unstable min-max risk score; an analyst/auditor will spot these. | Medium | Ship T2.4 first (relabel forecast, fix attrition denominator, add median/percentile) and make the cross-functional score absolute/stable with documented anchors. Cheap, high-trust. |
| 5 | **White-label and India context are copyable** — not moats alone; a determined incumbent could localize. | Medium | Don't rely on them as fortresses; rely on the **bundle** (offline+zero-infra+single-file+deterministic) which is *not* copyable. Use white-label/India to lock the **channel and beachhead** fast, before anyone bothers. |
| 6 | **"Whoever holds the file holds the data"** — portability is also an exfiltration/leak risk a CISO will flag. | Medium | Ship **workspace encryption + local audit log** (T1.1/T1.6) so the portable file is passphrase-protected and access-logged — converts the objection into a selling point. |
| 7 | **Single-thread render/jank** on data-rich workspaces, especially the newsletter (`Reports.tsx` mounts all Plotly figures at once) and per-keystroke `buildPeople` recompute. | Medium | T1.9 (memoize + debounce + Web Worker), T2.9 (lazy-mount newsletter sections), T2.10 (partial Plotly + gzip-serve). Keep the constant-size chart discipline (top-N caps) that already protects us. |
| 8 | **Engineering-maturity signal** — no CI, v0.1.0, ad-hoc `verify*.cjs` reads as risk to security reviewers regardless of code quality. | Low-Medium | T1.3: CI, SBOM, real versioning, `SECURITY.md`, dependency scanning. Pure signal-of-maturity, low effort. |
| 9 | **Regulatory shifts could erode the wedge** (e.g. data-residency rules relax, or DEI/pay-equity demand cools in the 2025 backlash climate). | Low | Wedge rests on *privacy*, which is structurally rising (DPDP, GDPR, EU AI Act), not falling. For DEI, offer **neutral, internal-only "representation & equity"** analytics that run locally and are never published — matching the "strip the label, keep the work" posture enterprises have adopted. |

---

*Bottom line: we will not out-feature Visier or out-consult Deloitte, and we shouldn't try. We win by being the one thing none of them can be — an offline, deterministic, zero-infrastructure, single-file analyst that a privacy-constrained or under-served buyer can open and trust in minutes — and by closing the cheap, in-browser credibility gaps (encryption, accessibility, CI, validation) that today get us disqualified before that argument is ever heard.*
