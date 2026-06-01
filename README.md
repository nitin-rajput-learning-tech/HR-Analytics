# HR Analytics — White-Label Workforce Analytics Suite

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

Seven data domains, each with its own intake template and graceful "awaiting data" placeholders so partial data still produces a useful report:

| Domain | What it drives |
|---|---|
| **People & Org** (employee master) | Headcount, active ratio — the spine every domain joins to |
| **Talent Acquisition** | Funnel, offer-accept rate, requisition aging, source mix |
| **Performance (PMS)** | Review/goal completion, rating distribution, 9-box, PIP |
| **Payroll & Cost** | Cost/head, variable & overtime mix, statutory on-time compliance |
| **Learning & Development** | Completion, coverage vs headcount, spend, mandatory-training gaps |
| **HR Operations (Admin)** | Asset allocation, contract-renewal pipeline, on/off-boarding |
| **Cross-Functional Risk** | Compound-risk scoring, attrition economics, regrettable-exit detection |

The **CHRO Newsletter** rolls all of the above into an executive brief (headline KPIs, wins, top risks), one section per function, and a single prioritised action plan. The narrative is **100% deterministic and rule-based — no AI/LLM is involved**, so the same data always yields the same report and nothing is ever sent to a third party.

## White-labelling

Open the **Branding** page to set the app name, primary/accent colours, logo and footer. Branding flows through the whole UI, the charts and the newsletter, and is saved inside the workspace file. Export/import a theme as JSON to share a brand kit across the team.

## Quick start

Requires Node.js 18+ (built with Node 24 / npm 11).

```bash
npm install        # installs React, Plotly, SheetJS, Arquero, pako, esbuild-wasm
npm test           # runs the unit suite (66 tests)
npm run typecheck  # full TypeScript check (tsc --noEmit)
npm run build      # produces a single self-contained dist/index.html
```

Ship `dist/index.html` — that one file *is* the application. Open it from disk or a share; no further setup.

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
│   ├── datasets.ts            # Dataset-kind registry (single source of truth, 13 schemas)
│   ├── ingest/                # Workbook parsing, coercion, period detection
│   ├── store/                 # In-memory snapshot store (DataSource)
│   ├── narrative.ts           # Deterministic number→prose helpers (no LLM)
│   ├── charts.ts              # ChartSpec → Plotly figure (brand-aware)
│   ├── intake/template.ts     # Schema → downloadable .xlsx template (AoA)
│   └── metrics/               # One pure compute() per domain → DomainMetrics
│       ├── overview, talent_acquisition, pms, payroll, ld, admin
│       ├── cross_functional   # compound risk, attrition economics, regrettable exits
│       └── index.ts           # per-domain dispatcher (per-domain as-of dates)
├── reports/
│   ├── newsletter.ts          # Assembles the CHRO Newsletter model
│   └── factsPack.ts           # Newsletter → Markdown rollup
├── ui/                        # React: AppShell, pages, components (Chart, DomainView)
├── branding/                  # Brand model + CSS variable application
└── workspace/                 # Gzipped JSON save/load
```

**Tech stack:** React 18 + TypeScript + Vite (single-file via `vite-plugin-singlefile`), Plotly.js (charts), SheetJS (Excel I/O), Arquero (tabular ops), pako (gzip). Tests: Vitest.

Each `metrics/*.compute()` is a pure function over the latest snapshot rows returning a `DomainMetrics` (KPIs, chart specs, tables, severity-ranked watch-outs). The newsletter and dashboards both render the same objects, which is why the whole engine is testable without a DOM.

## Data & privacy

- All processing is in-browser; no network calls are made with your data.
- The workspace file is the only persistence — you control where it lives.
- There is no authentication layer by design (offline, single-file). Protect the file and workspace like any sensitive spreadsheet.

## Legacy

The original Python/Streamlit desktop implementation is preserved under [`legacy/python/`](legacy/python/) for reference. The browser product supersedes it.

## License

Proprietary — All rights reserved. See [LICENSE](LICENSE).
