# White-Label HR Analytics — Browser Edition (Design Spec)

**Date:** 2026-05-30
**Status:** Approved design, pending implementation plan
**Repo:** https://github.com/nitin-rajput-learning-tech/HR-Analytics
**Product framing:** Public, white-label, **Phase A** (offline rebrandable tool) now; **Phase B** (hosted multi-tenant SaaS) later.

---

## Context

We built an internal HR analytics suite (Python/Streamlit: multi-domain ingestion, per-domain
metrics, rule-based monthly newsletter, cross-functional intelligence — 11 pages, 46 tests). On
locked-down corporate Windows it suffers from antivirus intermittently blocking Python's native
DLLs (`numpy`/`pandas`/`duckdb`) at load. The decision is to ship the product as a **browser-only,
white-label tool any organisation can download and run** — no native code on disk, so the AV
problem is structurally impossible — and to **publish/maintain it in the GitHub repo above**.

**Phasing (agreed):**
- **Phase A (this spec):** offline, rebrandable, single-file browser app. Each org runs it locally;
  their data never leaves their machine. White-label = in-app branding.
- **Phase B (future, separate spec):** hosted multi-tenant SaaS (sign-up, per-tenant data isolation,
  billing, compliance). Out of scope here, but the **core engine is kept framework-agnostic and
  data-source-abstracted so it can be reused server-side** without a rewrite.

## Goals (Phase A)

- Single self-contained `hr-analytics.html` that runs **from a local file (double-click) or from
  SharePoint/shared drive** — fully offline, no install, no host, no Python, no native code.
- **Full feature parity** with the Python suite (all 11 pages).
- **White-label:** ships with a neutral default brand; any org sets its own **name, logo, colours**
  in-app (no rebuild, no technical skill).
- HR PII **never leaves the browser**.
- Deterministic, no-AI analytics and newsletter.

## Non-goals (Phase A)

- Hosting/multi-tenancy/auth/billing (that's Phase B).
- Automatic browser-storage persistence (superseded by the workspace-file model).
- AI/LLM features.
- Porting the Python launchers (`.bat`, PyInstaller, desktop/server).

## Constraints that shaped the design

- **Must run from `file://`** → no Web Workers, no separately-served `.wasm`, no cross-origin
  isolation headers → **pure-JavaScript** data stack (rules out DuckDB-WASM); everything inlined
  into one HTML (Vite single-file build).
- **No server** → no enforceable login; security = "whoever holds the file + workspace can open it"
  (same trust model as an Excel file).
- **Public/white-label** → zero hardcoded customer branding; neutral defaults + per-org config.

## Technology stack

| Concern | Choice | Notes |
|---|---|---|
| Build | **Vite + React + TypeScript** + `vite-plugin-singlefile` | One `.html`; React structures 11 pages |
| Excel I/O | **SheetJS** (`xlsx`, Apache-2.0) | Reads uploaded `.xlsx` via FileReader |
| Data engine | **Arquero** (BSD) + plain TS | group-by/join/filter/agg; custom math (OLS forecast, risk scoring) in TS |
| Charts | **Plotly.js** (MIT), trimmed to bar/pie/line/funnel | Chart parity; trimmed bundle keeps file ~2 MB |
| Routing/state | React + **hash router**; light store (context/zustand) | Hash routing works under `file://` |
| Persistence | Workspace file (gzipped JSON via `pako`) | Save/Load one file; identical in both modes |
| Branding | In-app settings persisted in workspace + exportable theme file | Neutral default; CSS variables driven by config |

Rejected: **DuckDB-WASM** (needs worker/served wasm/COOP-COEP → can't be a double-click local file);
**no-build vanilla JS** (11 interactive pages unmaintainable; React+Vite still compiles to one file).

## Architecture — module layout (faithful port; framework-agnostic core for Phase B)

| Browser module | Ports from | Responsibility |
|---|---|---|
| `src/core/datasets.ts` | `datasets.py` | Schema registry — single source of truth (kinds, fields, types, keys, header aliases, teams) |
| `src/core/ingest/` | `adapters/workbook.py`, `adapters/dataset.py` | SheetJS read → detect sheet, map headers via alias map, coerce by dtype, derive period, compatibility, validation issues |
| `src/core/store/` | `repository.py` | In-memory snapshots keyed by (kind, as-of); employee-event derivation; current snapshot; filters; latest-per-kind. **Behind a `DataSource` interface** so Phase B can swap in a server/db source |
| `src/core/metrics/` | `analytics.py`, `metrics/*` | Employee analytics + per-domain (TA/PMS/Payroll/L&D/Admin) + cross-functional; pure fns → `DomainMetrics { kpis, charts(ChartSpec), tables, watchouts }` |
| `src/core/narrative.ts` | `narrative.py` | Deterministic prose helpers |
| `src/core/newsletter/` | `reports/newsletter.py`, `sections.py` | Assemble cross-domain newsletter → HTML view + Print-to-PDF + download HTML/facts-pack |
| `src/core/charts.ts` | `charts.py` | `ChartSpec` → Plotly figure |
| `src/branding/` | (new) | Branding config type, neutral defaults, CSS-variable theming, logo handling, theme import/export |
| `src/ui/` | `streamlit_app.py` | 11 React pages + a **Branding settings** page; sidebar nav; snapshot picker; global filters |
| `src/workspace/` | (new) | Serialize/deserialize all snapshots + branding to one gzipped-JSON workspace file |

**`src/core/` is UI-free and browser-API-free where possible** (pure TS + Arquero) → unit-testable and
reusable by a future Phase B server.

## White-label / branding

- **Neutral default brand**: generic name ("HR Analytics"), neutral colour palette, placeholder logo.
- **Branding settings page**: org sets **App name**, **logo** (uploaded image → stored as data-URI),
  **primary & accent colours**, optional **footer text**. Applied live via CSS custom properties.
- **Persistence**: branding is saved **inside the workspace file** (so reopening restores it) and can
  be **exported/imported as a small `theme.json`** to share across the org without sharing data.
- **No rebuild** required — any non-technical org can fully rebrand from the UI. Airpay becomes one
  example theme, not a hardcoded default.

## Data flow

```
upload .xlsx ─SheetJS→ rows ─ingest(schema)→ SnapshotCandidate ─store.add→ snapshots
                                                                      │
                         metrics.compute / newsletter.build ◄────────┘
                                   │
                          pages render (Plotly + tables + KPIs + watchouts), themed by branding config

Save workspace → { snapshots, branding } → gzip → download hr-workspace.json.gz
Load workspace → ungzip → hydrate store + apply branding
```

## Persistence — workspace file

- Versioned gzipped JSON:
  ```json
  { "format": "hr-analytics-workspace", "version": 1, "generatedAt": "<ISO>",
    "branding": { "appName": "...", "logoDataUri": "...", "primary": "#...", "accent": "#...", "footer": "..." },
    "snapshots": [ { "kind": "...", "asOf": "YYYY-MM-DD", "periodLabel": "...",
                     "sourceFile": "...", "compatibility": "...", "rows": [ {…} ] } ] }
  ```
- Save = `Blob` download; Load = `FileReader`. Works identically under `file://` and served.
- Forward-compatible: `version` gate; unknown fields ignored.

## Trust / security model

- No authentication (no server). The `.html` is inert and data-free.
- The **workspace file** holds the HR data — protect/share it like a sensitive Excel file.
- Documented in-app (note on Data Intake/Save) and in the README.

## Pages (full parity)

Overview · Organization Structure · Manager View · Movement & Attrition · Predictive Analysis ·
Diversity & Geography · Data Quality & Audit · Function Analytics (incl. Cross-Functional Risk) ·
Reports/Newsletter · Data Intake · Uploads & Archive — **plus** a new **Branding (Settings)** page.

## Repository plan

- **Build the browser app in the cloned repo** (`D:\Claude Local\HR-Analytics-repo`, `origin` = the
  GitHub repo). Web app at repo root (`package.json`, `src/`, `index.html`, `vite.config.ts`).
- **Preserve the existing Python app** by moving it to `legacy/python/` (kept for reference/self-host),
  with a note in the README. Nothing is deleted.
- **README** rewritten for the public white-label product (what it is, download/run, rebrand, build).
- **LICENSE**: **Proprietary — All rights reserved** (closed-source; owner controls distribution and
  may sell/white-label commercially). A `LICENSE` file with this notice ships in the repo; the README
  states the terms. No third-party copyleft deps are introduced (all chosen libs are MIT/BSD/Apache).
- Work on feature branches → PRs into `main`; I prepare commits and push using the stored credential.

## Testing strategy

- **Vitest** unit tests porting the Python assertions: registry integrity, ingestion round-trip
  (in-memory SheetJS), each domain's metrics, cross-functional, narrative, **branding apply/export/import**,
  **workspace save/load round-trip**.
- **Build verification** with Playwright: build the single `.html`, open it, upload a sample, set a
  brand, save+reload a workspace, confirm pages + newsletter render with no console errors.

## Build & distribution

- `npm install` → `npm run build` → `dist/hr-analytics.html` (one file).
- Distribute via **GitHub Releases** (downloadable artifact) and/or a simple download page; orgs can
  also drop it on their own SharePoint.
- Plotly trimmed to required traces to keep the artifact lean (~2 MB target).

## Phase B readiness (non-binding notes)

- Keep `src/core/*` free of React/DOM so it can run under Node/server.
- `DataSource` interface (workspace-file impl now; server/db impl later) is the seam for multi-tenancy.
- Branding config generalises to per-tenant theming.

## Risks & mitigations

- **Bundle size** (Plotly heavy) → trim traces; gzip when served; ~2 MB acceptable for a local file.
- **Large workbooks** → SheetJS + Arquero handle a few thousand rows easily; chunk if a future file is huge.
- **`file://` quirks** → avoided via single-file inlining + hash routing + no workers/fetch.
- **Parity drift** vs Python → registry + metric assertions ported 1:1 and test-covered.
- **Push access** → credential stored in Windows Credential Manager; non-interactive pushes verified.
