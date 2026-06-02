# HR Analytics — White-Label Workforce Analytics Suite

[![CI](https://github.com/nitin-rajput-learning-tech/HR-Analytics/actions/workflows/ci.yml/badge.svg)](https://github.com/nitin-rajput-learning-tech/HR-Analytics/actions/workflows/ci.yml)

A self-contained, **browser-based** HR analytics suite that any organisation can rebrand and run with **zero infrastructure**. Drop in monthly workbooks for any HR function and get interactive dashboards plus an auto-generated, board-ready **CHRO newsletter** — with a prioritised, owner-tagged action plan.

> **Private by design.** The app is a single static HTML file. There is no server, no login, no telemetry, and no cloud. Every byte of data stays in the browser tab. Trust model: whoever holds the file (and the saved workspace) holds the data.

---

## Why it exists

Most HR analytics tooling needs IT to provision servers, databases or installers — and HR data is exactly the data you least want leaving the building. This product compiles to **one `dist/index.html`** you can:

- open by double-clicking (`file://`), or
- drop on a SharePoint / network share for the team, or
- host on any static web server.

No Python, no `.exe`, no native dependencies — so the antivirus / AppContainer restrictions that block desktop installers and Python DLLs don't apply.

## What it covers

Eight data domains, each with its own intake template and graceful "awaiting data" placeholders so partial data still produces a useful report:

| Domain | What it drives |
|---|---|
| **People & Org** (employee master) | Headcount, tenure (median + IQR), diversity, geography, span of control, attrition & movement/forecast, data quality |
| **Talent Acquisition** | Funnel, offer-accept rate, requisition aging, source mix |
| **Performance (PMS)** | Review/goal completion, rating distribution, 9-box, PIP |
| **Payroll & Cost** | Cost/head, variable & overtime mix, statutory on-time compliance |
| **Learning & Development** | Completion, coverage vs headcount, spend, mandatory-training gaps |
| **HR Operations (Admin)** | Asset allocation, contract-renewal pipeline, on/off-boarding |
| **Engagement** | eNPS and driver scores by team (anonymous survey — no individual is identifiable) |
| **Cross-Functional Risk** | Compound-risk scoring, attrition economics, regrettable-exit detection |

The **CHRO Newsletter** rolls all of the above into an executive brief (headline KPIs, wins, top risks), one section per function, and a single prioritised action plan. The narrative is **100% deterministic and rule-based — no AI/LLM is involved**, so the same data always yields the same report and nothing is ever sent to a third party.

## Analytics & enterprise capabilities

Beyond the dashboards, the People Analytics page and the suite carry capabilities normally sold as bespoke consulting or enterprise SaaS — all offline:

- **Explainable attrition-risk index** — a 0–100 per-employee score that *is* its own explanation: a weighted sum of named signals (early tenure, team churn, manager overload, pay gap, performance), so each score breaks into "driver +points". No black box, no model to train.
- **Scenario / what-if planner** — model hiring, cuts and reorganisations; headcount and INR cost impact recompute instantly (per-department cost from the payroll aggregate — no individual salaries needed).
- **Pay equity** — gender pay gap by department with EU Pay Transparency Directive 5%-threshold flagging and a remediation-cost simulator.
- **Month-over-month KPI deltas**, a cross-tab **"needs attention"** insights banner, drill-down from any chart, and saved views.

**Hardening (enterprise-readiness):** optional **AES-256-GCM workspace encryption** (passphrase, WebCrypto) · a local **audit log** embedded in the workspace · **schema versioning + migration** so old saved files never mis-bind · **CSV & XLSX import** with a row-level validation preview (enum / type / required / **referential-integrity** checks) · **WCAG 2.1 AA** (measured contrast, focus traps, skip link, reduced-motion) · **CI + CycloneDX SBOM** + a single-file size budget · **light/dark themes** · a **⌘/Ctrl-K command palette**. ~170 unit tests; the whole app ships as one ~2.6 MB HTML file.

## White-labelling

Open the **Branding** page to set the app name, primary/accent colours, logo and footer. Branding flows through the whole UI, the charts and the newsletter, and is saved inside the workspace file. Export/import a theme as JSON to share a brand kit across the team.

## Quick start

Requires Node.js 18+ (built with Node 24 / npm 11).

```bash
npm install        # installs React, Plotly (basic), SheetJS, Arquero, pako, esbuild-wasm
npm test           # runs the unit suite (~170 tests)
npm run typecheck  # full TypeScript check (tsc --noEmit)
npm run build      # produces a single self-contained dist/index.html (~2.6 MB)
npm run verify     # typecheck + test + build + size budget (the pre-push gate)
```

Ship `dist/index.html` — that one file *is* the application. Open it from a share; no further setup.

**Try it with sample data:** `npm run sample-data` writes synthetic workbooks to `sample-data/`. Open the app and **Load workspace** → `sample-data/Airpay-HR-sample-workspace.json.gz` to populate every dashboard and the newsletter instantly. See [sample-data/README.md](sample-data/README.md).

### Running it

| How you open it | Origin | Works fully? |
|---|---|---|
| SharePoint / any web host | `https://` | ✅ Yes — recommended for the team |
| `npm run serve` then http://localhost:4173 | `http://` | ✅ Yes — recommended for local use/testing |
| Double-click the file | `file://` | ⚠️ Viewing & analytics work, but Chrome **blocks `blob:` downloads from `file://`**, so *Download template / facts pack / Save workspace* silently do nothing |

The `file://` limitation is a Chrome security policy, not an app bug — uploads and all dashboards/newsletter work there, but **template/workspace downloads need a real origin**. For local use run `npm run serve` (serves the built file at `http://localhost:4173`); for the team, host `index.html` on SharePoint/https where downloads work normally.

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
