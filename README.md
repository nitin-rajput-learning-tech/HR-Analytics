# HR Analytics — White-Label Workforce Analytics Suite

[![CI](https://github.com/nitin-rajput-learning-tech/HR-Analytics/actions/workflows/ci.yml/badge.svg)](https://github.com/nitin-rajput-learning-tech/HR-Analytics/actions/workflows/ci.yml)

A self-contained, **browser-based** HR analytics suite that any organisation can rebrand and run with **zero infrastructure**. Drop in monthly workbooks for any HR function and get interactive dashboards plus an auto-generated, board-ready **CHRO newsletter** — with a prioritised, owner-tagged action plan.

> **Private by design.** The app is a single static HTML file. There is no server, no login, no telemetry, and no cloud. Every byte of data stays in the browser tab. Trust model: whoever holds the file (and the saved workspace) holds the data.

---

## Why it exists

Most HR analytics tooling needs IT to provision servers, databases or installers — and HR data is exactly the data you least want leaving the building. This product compiles to **one `dist/index.html`** you can:

- run the included **`Run HR Analytics.bat`** launcher (Windows) for a proper `http://localhost` origin — recommended, needs nothing installed, or
- drop on a SharePoint / network share for the team, or
- host on any static web server.

> ⚠️ **Don't just double-click `index.html`.** Opening it via `file://` works for *viewing*, but Chrome — and corporate security / DLP tools — ignore download filenames (you get a random name with no extension) and block file pickers from `file://` pages. Use the launcher or a hosted `http(s)://` URL so downloads, uploads and saved data all work.

No Python, no `.exe`, no native dependencies — so the antivirus / AppContainer restrictions that block desktop installers and Python DLLs don't apply.

## Running it

**Windows (recommended):** double-click **`Run HR Analytics.bat`**. It serves the app at `http://localhost:4173` using built-in PowerShell — no install, no admin — and opens your browser. Keep the small console window open while you work; close it to stop.

**With Node:** `npm run serve` (serves on `http://localhost:4173` and opens the browser).

**For the team:** host `dist/index.html` on SharePoint, a network share, or any static web server — any `http(s)://` origin gives full functionality.

Why it matters: on a real origin the browser honours download filenames, opens file pickers, and keeps your auto-saved data durably — none of which is reliable from `file://`.

## What it covers

Eight data domains, each with its own intake template and graceful "awaiting data" placeholders so partial data still produces a useful report:

| Domain | What it drives |
|---|---|
| **People & Org** (employee master) | Headcount, tenure (median + IQR), diversity, **representation (DEI)**, geography, span of control, attrition & movement/forecast, **retention & quality-of-hire**, attrition-risk, **compensation**, **pay equity**, data quality |
| **Talent Acquisition** | Funnel, offer-accept rate, requisition aging, source mix |
| **Performance (PMS)** | Review/goal completion, rating distribution, 9-box, PIP |
| **Payroll & Cost** | Cost/head, variable & overtime mix, statutory on-time compliance |
| **Learning & Development** | Completion, coverage vs headcount, spend, mandatory-training gaps |
| **HR Operations (Admin)** | Asset allocation, contract-renewal pipeline, on/off-boarding |
| **Engagement** | eNPS and driver scores by team (anonymous survey — no individual is identifiable) |
| **Cross-Functional Risk** | Compound-risk scoring, attrition economics, regrettable-exit detection |

The **CHRO Newsletter** rolls all of the above into an executive brief (a one-paragraph summary, headline KPIs, a **scorecard vs targets**, wins, top risks, and notable **month-over-month movers**), one section per function, and a single prioritised action plan. The narrative is **100% deterministic and rule-based — no AI/LLM is involved**, so the same data always yields the same report and nothing is ever sent to a third party.

## Analytics & enterprise capabilities

Beyond the dashboards, the People Analytics page and the suite carry capabilities normally sold as bespoke consulting or enterprise SaaS — all offline:

- **Targets & Scorecard (management-by-objective)** — set a target per headline KPI; a RAG (red/amber/green) scorecard shows status against goal across the suite *and* inside the newsletter. Targets persist with the workspace (auto-saved + saved/exported).
- **Retention & quality-of-hire** — first-year and 90-day exit signals, an exit-timing curve and joining-cohort retention, so you see whether new hires *stay* — not just headline attrition.
- **Compensation analytics** — pay distribution (median, P10–P90), dispersion (P90/P10), top-decile concentration and pay progression by tenure (compression detection).
- **Representation (DEI)** — leadership vs overall gender mix, representation across seniority, and the hires-vs-leavers diversity pipeline (is representation improving or eroding?).
- **Regrettable attrition** — high-performer / high-potential leavers, surfaced in cross-functional risk and the newsletter's action plan.
- **Explainable attrition-risk index** — a 0–100 per-employee score that *is* its own explanation: a weighted sum of named signals (early tenure, team churn, manager overload, pay gap, performance), so each score breaks into "driver +points". No black box, no model to train.
- **Scenario / what-if planner** — model hiring, cuts and reorganisations; headcount and INR cost impact recompute instantly (per-department cost from the payroll aggregate — no individual salaries needed).
- **Pay equity** — gender pay gap by department with EU Pay Transparency Directive 5%-threshold flagging and a remediation-cost simulator.
- **Month-over-month KPI deltas**, a cross-tab **"needs attention"** insights banner, drill-down from any chart, and saved views.

**Hardening (enterprise-readiness):** optional **AES-256-GCM workspace encryption** (passphrase, WebCrypto) · a local **audit log** embedded in the workspace · **schema versioning + migration** so old saved files never mis-bind · **CSV & XLSX import** with a row-level validation preview (enum / type / required / **referential-integrity** checks) · **WCAG 2.1 AA** (axe-audited; colour contrast enforced by a **CI gate**; focus traps, skip link, reduced-motion) · **CI + CycloneDX SBOM** + a single-file size budget · **light/dark themes** · a **⌘/Ctrl-K command palette**. **203 unit tests**; the whole app ships as one ~2.7 MB HTML file.

## White-labelling

Open the **Branding** page to set the app name, primary/accent colours, logo and footer. Branding flows through the whole UI, the charts and the newsletter, and is saved inside the workspace file. Export/import a theme as JSON to share a brand kit across the team.

## Quick start

Requires Node.js 18+ (built with Node 24 / npm 11).

```bash
npm install        # installs React, Plotly (basic), SheetJS, Arquero, pako, esbuild-wasm
npm test           # runs the unit suite (203 tests)
npm run typecheck  # full TypeScript check (tsc --noEmit)
npm run build      # produces a single self-contained dist/index.html (~2.7 MB)
npm run verify     # typecheck + test + build + size budget + a11y gate (the pre-push gate)
```

Ship `dist/index.html` — that one file *is* the application. Open it from a share; no further setup.

**Try it instantly:** the app **opens in demo mode** with a full sample organisation — every dashboard, the scorecard and the newsletter are populated out of the box. Upload your own workbooks (per the in-app templates) to switch to your data, which then **auto-saves on your device** and survives refreshes. (`npm run sample-data` regenerates the synthetic source workbooks; `npm run sample-workspace` rebuilds the embedded demo — see [sample-data/README.md](sample-data/README.md).)

### Running it

| How you open it | Origin | Works fully? |
|---|---|---|
| **Run HR Analytics.bat** (Windows, double-click) | `http://localhost` | ✅ Yes — zero install (built-in PowerShell, no admin); recommended if you can't host |
| SharePoint / any web host | `https://` | ✅ Yes — recommended for the team |
| `npm run serve` then http://localhost:4173 | `http://` | ✅ Yes — for local dev |
| Double-click `index.html` | `file://` | ⚠️ Viewing & analytics work, but Chrome **blocks downloads *and* the upload file-picker** from `file://` — use the launcher instead |

The `file://` limitation is a Chrome (and corporate-DLP) security policy, not an app bug. The simplest fix on Windows: **double-click `Run HR Analytics.bat`** — it serves the file at `http://localhost` using built-in PowerShell (nothing to install, no admin) and opens your browser. For the team, host `index.html` on SharePoint/https. Any real origin makes downloads, the upload picker and durable saved data all work.

> Tip: uploads are matched to a period from the **filename** — include a date (e.g. `Employee report as on 2026-03-31.xlsx`, `TA_requisitions_2026-05.xlsx`). A file with no recognizable date is rejected with an on-screen message.

### Why the build is esbuild-free

Locked-down Windows (AppContainer / endpoint protection) often blocks the **native `esbuild` Go binary** from loading system DLLs (`winmm.dll`), which breaks `vite build` and `vitest` with a `runtime: panic before malloc heap initialized` crash. To stay portable, `npm run build` and `npm test` use **`esbuild-wasm`** — the same compiler compiled to WebAssembly, which runs inside Node and never touches a system DLL. Nothing native is required to build, test, or run.

- `npm run build` → `scripts/build.mjs` (esbuild-wasm bundles + inlines into one HTML)
- `npm test` → `scripts/test.mjs` (esbuild-wasm bundles the specs; a tiny vitest-compatible shim runs them in Node)
- `npm run dev` / `build:vite` / `test:vitest` are kept for unrestricted environments where the native binary works (Vite dev server with HMR), but are **not required**.

## Using it

1. **Branding** — set your organisation's name, colours and logo (optional).
2. **Data Intake** — pick a domain, click **Download template** to get a pre-formatted `.xlsx` (Data + Data Dictionary + README sheets), fill it, and upload. The "Loaded data" panel shows what's in.
3. **Function Analytics** — per-function dashboards (KPIs, charts, tables, watch-outs) that update as you upload.
4. **Newsletter** — the assembled CHRO report. **Print / Save as PDF** for distribution, or download the Markdown **facts pack**.
5. **Save workspace** — download a gzipped `.json.gz` containing all uploaded data + branding. Load it later (or on another machine) to pick up exactly where you left off.

Name files with the period for automatic as-of detection (e.g. `TA_requisitions_2026-05.xlsx`); the template's README sheet states each domain's convention.

## Architecture

The analytics engine is **pure, presentation-agnostic data** — fully unit-tested independently of the UI:

```
src/
├── core/
│   ├── datasets.ts            # Dataset-kind registry (single source of truth, 14 schemas)
│   ├── ingest/                # Workbook parsing, coercion, period, validation + referential checks
│   ├── store/                 # In-memory snapshot store (DataSource)
│   ├── narrative.ts           # Deterministic number→prose helpers (no LLM)
│   ├── charts.ts              # ChartSpec → Plotly figure (brand-aware, dark-mode-aware)
│   ├── intake/                # Schema → .xlsx template + demo-data generator
│   └── metrics/               # One pure compute() per domain → DomainMetrics
│       ├── people, overview, movement, compare, stats   # People analytics + deltas + distribution stats
│       ├── risk, scenario, pay_equity                   # attrition-risk index · what-if planner · pay equity
│       ├── talent_acquisition, pms, payroll, ld, admin, engagement
│       ├── cross_functional   # compound risk, attrition economics, regrettable exits
│       └── index.ts           # registry-driven domain dispatcher (one entry per domain)
├── reports/
│   ├── newsletter.ts          # Assembles the CHRO Newsletter model
│   └── factsPack.ts           # Newsletter → Markdown rollup
├── ui/                        # React: AppShell, pages, components (Chart, DomainView, CommandPalette, toast, focus-trap)
├── branding/                  # Brand model + CSS variable application (light/dark themes)
└── workspace/                 # Gzipped JSON save/load + AES-256-GCM encryption + schema migration
```

**Tech stack:** React 18 + TypeScript + Vite (single-file build via esbuild-wasm), **plotly.js-basic** (charts), SheetJS (Excel/CSV I/O), Arquero (tabular ops), pako (gzip), WebCrypto (encryption). Tests: a Vitest-compatible shim run via esbuild-wasm.

Each `metrics/*.compute()` is a pure function over the latest snapshot rows returning a `DomainMetrics` (KPIs, chart specs, tables, severity-ranked watch-outs). The newsletter and dashboards both render the same objects, which is why the whole engine is testable without a DOM.

## Data & privacy

- All processing is in-browser; no network calls are made with your data.
- The workspace file is the only persistence — you control where it lives. It can optionally be **encrypted with a passphrase** (AES-256-GCM via WebCrypto) on save, so the saved file isn't plaintext PII.
- There is no server-side authentication by design (offline, single-file). For shared/multi-user access with SSO and RBAC you'd put it behind a gateway; the single-file edition's trust model is "whoever holds the (optionally encrypted) file holds the data."
- A local **audit log** of data actions (save / load / publish) is embedded in the workspace for a basic activity trail.

## Legacy

The original Python/Streamlit desktop implementation is preserved under [`legacy/python/`](legacy/python/) for reference. The browser product supersedes it.

## License

Proprietary — All rights reserved. See [LICENSE](LICENSE).
