# White-Label HR Analytics (Browser) — Plan 1: Foundation & Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the repo and a runnable single-file browser app that can ingest the employee-master workbook, apply org branding, show a basic Overview, and save/load a workspace file — the foundation every later feature builds on.

**Architecture:** Vite + React + TypeScript compiled to one self-contained `.html` (works from `file://` or a static host). A UI-free `src/core/` (registry, ingest, store-behind-a-DataSource-interface) plus `src/branding/`, `src/workspace/`, and a thin `src/ui/`. Pure-JS data stack (SheetJS + Arquero); no native code, no server, no login. Spec: `docs/superpowers/specs/2026-05-30-browser-hr-analytics-design.md`.

**Tech Stack:** Vite, React 18, TypeScript, vite-plugin-singlefile, Vitest, SheetJS (`xlsx`), Arquero, `pako`. (Plotly.js arrives in Plan 2.)

**Working context:** repo clone at `D:\Claude Local\HR-Analytics-repo` (`origin` = github.com/nitin-rajput-learning-tech/HR-Analytics). Node 24 + npm 11 available. The authoritative behaviour spec is the Python app under `legacy/python/` after Task 1.

---

### Task 1: Repo restructure & project scaffold

**Files:**
- Move existing Python files → `legacy/python/`
- Create: `LICENSE`, `.gitignore` (append Node), `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `vitest.config.ts`, `README.md`

- [ ] **Step 1: Branch**

```bash
cd "D:/Claude Local/HR-Analytics-repo"
git checkout main && git pull --ff-only
git checkout -b feat/browser-foundation
```

- [ ] **Step 2: Move the Python app to legacy/ (preserve, don't delete)**

```bash
mkdir -p legacy/python
git mv src config tests pyproject.toml requirements.txt Run_HR_Analytics.bat HR_Analytics_Employee_Template.xlsx legacy/python/
git status
```
Expected: those paths now show as renamed under `legacy/python/`.

- [ ] **Step 3: Add proprietary LICENSE**

Create `LICENSE`:
```text
Copyright (c) 2026 Nitin Rajput. All rights reserved.

This software and its source code are proprietary and confidential.
No permission is granted to use, copy, modify, merge, publish, distribute,
sublicense, or sell copies of this software without the prior written consent
of the copyright holder. Unauthorized use is prohibited.
```

- [ ] **Step 4: Scaffold Vite + React + TS**

Create `package.json`:
```json
{
  "name": "hr-analytics-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "arquero": "^8.0.3",
    "pako": "^2.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
  },
  "devDependencies": {
    "@types/pako": "^2.0.3",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^6.0.5",
    "vite-plugin-singlefile": "^2.1.0",
    "vitest": "^2.1.8"
  }
}
```
> Note: SheetJS is installed from the vendor tarball (their recommended channel), not the stale npm mirror.

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ESNext", "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"], "jsx": "react-jsx",
    "strict": true, "noUnusedLocals": true, "noUnusedParameters": true,
    "skipLibCheck": true, "esModuleInterop": true, "resolveJsonModule": true,
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

Create `vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { target: "es2022", outDir: "dist", assetsInlineLimit: 100000000, cssCodeSplit: false },
});
```

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { globals: true, environment: "node" } });
```

Create `index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HR Analytics</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/main.tsx`:
```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
```

Create `src/App.tsx`:
```tsx
export function App() {
  return <h1>HR Analytics — scaffold OK</h1>;
}
```

- [ ] **Step 5: Append Node ignores to .gitignore**

Append to `.gitignore`:
```gitignore
# Node / Vite
node_modules/
dist/
*.local
.vite/
```

- [ ] **Step 6: Install and verify the build produces a single file**

```bash
npm install
npm run build
ls dist
```
Expected: `dist/index.html` exists and is self-contained (assets inlined; essentially just `index.html`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: move python app to legacy, scaffold vite+react+ts single-file build"
```

---

### Task 2: Branding module (config, defaults, theming, import/export)

**Files:**
- Create: `src/branding/branding.ts`
- Test: `src/branding/branding.test.ts`

- [ ] **Step 1: Write the failing test**

`src/branding/branding.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_BRANDING, applyBranding, serializeTheme, parseTheme, type Branding } from "./branding";

describe("branding", () => {
  it("ships a neutral default brand", () => {
    expect(DEFAULT_BRANDING.appName).toBe("HR Analytics");
    expect(DEFAULT_BRANDING.primary).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("applies branding to CSS variables on a target element", () => {
    const seen: Record<string, string> = {};
    const el = { style: { setProperty: (k: string, v: string) => { seen[k] = v; } } } as any;
    const brand: Branding = { ...DEFAULT_BRANDING, primary: "#123456", accent: "#abcdef", appName: "Acme HR" };
    applyBranding(brand, el);
    expect(seen["--brand-primary"]).toBe("#123456");
    expect(seen["--brand-accent"]).toBe("#abcdef");
  });

  it("round-trips a theme file (export then import)", () => {
    const brand: Branding = { ...DEFAULT_BRANDING, appName: "Acme", footer: "(c) Acme" };
    expect(parseTheme(serializeTheme(brand))).toEqual(brand);
  });

  it("parseTheme fills missing fields from defaults", () => {
    const back = parseTheme(JSON.stringify({ format: "hr-analytics-theme", version: 1, branding: { appName: "Only Name" } }));
    expect(back.appName).toBe("Only Name");
    expect(back.primary).toBe(DEFAULT_BRANDING.primary);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- branding`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

`src/branding/branding.ts`:
```ts
export interface Branding {
  appName: string;
  logoDataUri: string | null;
  primary: string;
  accent: string;
  footer: string;
}

export const DEFAULT_BRANDING: Branding = {
  appName: "HR Analytics",
  logoDataUri: null,
  primary: "#1f2937",
  accent: "#2563eb",
  footer: "Generated locally — your data never leaves this browser.",
};

interface CssTarget { style: { setProperty(k: string, v: string): void } }

export function applyBranding(b: Branding, target: CssTarget = document.documentElement): void {
  target.style.setProperty("--brand-primary", b.primary);
  target.style.setProperty("--brand-accent", b.accent);
}

const THEME_FORMAT = "hr-analytics-theme";

export function serializeTheme(b: Branding): string {
  return JSON.stringify({ format: THEME_FORMAT, version: 1, branding: b }, null, 2);
}

export function parseTheme(json: string): Branding {
  const parsed = JSON.parse(json);
  const incoming = (parsed && parsed.branding) || {};
  return { ...DEFAULT_BRANDING, ...incoming };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- branding`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/branding
git commit -m "feat(branding): neutral default brand, css-var theming, theme import/export"
```

---

### Task 3: Dataset registry (`datasets.ts`) ported from Python

**Files:**
- Create: `src/core/datasets.ts`
- Test: `src/core/datasets.test.ts`
- Reference: `legacy/python/src/airpay_hr_analytics/datasets.py` (authoritative — port ALL 13 kinds and every field exactly)

- [ ] **Step 1: Write the failing parity test**

`src/core/datasets.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ALL_SCHEMAS, getSchema, allTeams, GENERIC_KINDS } from "./datasets";

describe("dataset registry parity", () => {
  it("contains all 13 kinds, employee_master + 12 generic", () => {
    const kinds = ALL_SCHEMAS.map(s => s.kind);
    expect(kinds).toContain("employee_master");
    expect(kinds.length).toBe(13);
    expect(new Set(kinds).size).toBe(13);
    expect(GENERIC_KINDS).not.toContain("employee_master");
    expect(GENERIC_KINDS.length).toBe(12);
  });

  it("every key field and alias maps to a real field", () => {
    for (const s of ALL_SCHEMAS) {
      const cols = new Set(s.fields.map(f => f.name));
      for (const k of s.keyFields) expect(cols.has(k)).toBe(true);
      for (const canonical of Object.values(s.aliasMap())) expect(cols.has(canonical)).toBe(true);
    }
  });

  it("TA requisition required fields match the Python spec", () => {
    const ta = getSchema("ta_requisition");
    expect([...ta.requiredFields()].sort()).toEqual(
      ["department", "job_title", "open_date", "requisition_id", "status"].sort()
    );
  });

  it("teams exclude the employee master", () => {
    expect(allTeams()).toEqual(["Talent Acquisition", "Performance", "Payroll", "L&D", "HR Admin", "Planning"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- datasets`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the registry (port datasets.py 1:1)**

Create `src/core/datasets.ts` with this exact shape, then port **every** schema/field from `legacy/python/src/airpay_hr_analytics/datasets.py` (same kinds, labels, dtypes, required flags, allowed values, examples, key fields, header aliases, teams). Two schemas are shown in full as the pattern; complete the remaining 11 identically — the parity test in Step 1 only passes when all 13 are present and correct.

```ts
export type DType = "string" | "integer" | "number" | "date" | "boolean";

export interface DatasetField {
  name: string; label: string; dtype: DType; required?: boolean;
  allowed?: readonly string[]; example?: string; note?: string;
}

export class DatasetSchema {
  constructor(
    readonly kind: string,
    readonly label: string,
    readonly team: string,
    readonly periodKind: "month" | "cycle" | "as_of",
    readonly fields: readonly DatasetField[],
    readonly keyFields: readonly string[],
    readonly headerAliases: Readonly<Record<string, string>> = {},
    readonly filenameHint = "",
    readonly description = "",
    readonly grain: "detail" | "aggregate" = "detail",
  ) {}
  get tableName() { return `${this.kind}_snapshots`; }
  get columnNames() { return this.fields.map(f => f.name); }
  requiredFields(): Set<string> { return new Set(this.fields.filter(f => f.required).map(f => f.name)); }
  field(name: string) { return this.fields.find(f => f.name === name); }
  aliasMap(): Record<string, string> {
    const m: Record<string, string> = {};
    for (const f of this.fields) { m[f.name.toLowerCase()] = f.name; m[f.label.toLowerCase()] = f.name; }
    for (const [raw, canon] of Object.entries(this.headerAliases)) m[raw.toLowerCase()] = canon;
    return m;
  }
}

const f = (
  name: string, label: string, dtype: DType = "string",
  opts: { required?: boolean; allowed?: readonly string[]; example?: string; note?: string } = {},
): DatasetField => ({ name, label, dtype, ...opts });

const EMPLOYEE_COLUMNS = [
  "employee_number","full_name","legal_entity","last_working_day","current_city","work_phone",
  "work_email","exit_requested_on","sub_department","gender","date_joined","employment_status",
  "job_title","l2_manager","reporting_manager","department",
] as const;

export const EMPLOYEE_MASTER = new DatasetSchema(
  "employee_master", "Employee Master", "Core People", "as_of",
  EMPLOYEE_COLUMNS.map(n => f(n, n.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()))),
  ["employee_number"], {}, "Employee report ... as on <date>.xlsx",
  "Monthly employee roster — the spine every other domain joins to.",
);

export const TA_REQUISITION = new DatasetSchema(
  "ta_requisition", "Talent Acquisition — Requisitions", "Talent Acquisition", "month",
  [
    f("requisition_id", "Requisition ID", "string", { required: true, example: "REQ-2026-0042" }),
    f("department", "Department", "string", { required: true, example: "Technology" }),
    f("sub_department", "Sub Department", "string", { example: "Backend Engineering" }),
    f("job_title", "Job Title", "string", { required: true, example: "Senior Software Engineer" }),
    f("level_grade", "Level / Grade", "string", { example: "L4" }),
    f("location", "Location", "string", { example: "Mumbai" }),
    f("hiring_manager", "Hiring Manager", "string", { example: "Priyanka Dalvi" }),
    f("employment_type", "Employment Type", "string", { allowed: ["FT","Contract","Intern"], example: "FT" }),
    f("status", "Status", "string", { required: true, allowed: ["Open","On-hold","Filled","Cancelled"], example: "Open" }),
    f("open_date", "Open Date", "date", { required: true, example: "2026-04-01" }),
    f("target_join_date", "Target Join Date", "date", { example: "2026-06-01" }),
    f("applications", "Applications", "integer", { example: "120" }),
    f("shortlisted", "Shortlisted", "integer", { example: "24" }),
    f("interviewed", "Interviewed", "integer", { example: "10" }),
    f("offers_made", "Offers Made", "integer", { example: "2" }),
    f("offers_accepted", "Offers Accepted", "integer", { example: "1" }),
    f("joined", "Joined", "integer", { example: "1" }),
    f("primary_source", "Primary Source", "string", { allowed: ["Referral","Agency","Portal","Internal","Direct"], example: "Referral" }),
    f("recruiter", "Recruiter", "string", { example: "Aarti Shah" }),
    f("cost", "Cost (INR)", "number", { example: "45000", note: "Optional total sourcing/recruiting cost." }),
  ],
  ["requisition_id"],
  { "req id": "requisition_id", "requisition": "requisition_id", "req": "requisition_id",
    "grade": "level_grade", "level": "level_grade", "source": "primary_source",
    "apps": "applications", "offers": "offers_made", "accepted": "offers_accepted" },
  "TA_requisitions_YYYY-MM.xlsx",
  "One row per requisition with funnel counts.",
);

// PORT REQUIRED: define the remaining 11 schemas from datasets.py in the same order as its
// ALL_SCHEMAS tuple — TA_AGGREGATE, PMS_REVIEW, PAYROLL_RECORD, PAYROLL_AGGREGATE,
// PAYROLL_STATUTORY, LD_PROGRAM, LD_ENROLLMENT, ADMIN_ASSET, ADMIN_CONTRACT, ADMIN_LIFECYCLE,
// HEADCOUNT_PLAN — each with identical fields/allowed/keys/aliases/team. Then list every schema
// (in that order) in ALL_SCHEMAS below. The Step-1 parity test fails until this is complete.

export const ALL_SCHEMAS: readonly DatasetSchema[] = [
  EMPLOYEE_MASTER, TA_REQUISITION, /* + the 11 remaining schemas, in datasets.py order */
];

export const DATASET_SCHEMAS: Record<string, DatasetSchema> =
  Object.fromEntries(ALL_SCHEMAS.map(s => [s.kind, s]));
export const EMPLOYEE_KIND = "employee_master";
export const GENERIC_KINDS = ALL_SCHEMAS.map(s => s.kind).filter(k => k !== EMPLOYEE_KIND);

export function getSchema(kind: string): DatasetSchema {
  const s = DATASET_SCHEMAS[kind];
  if (!s) throw new Error(`Unknown dataset kind: ${kind}`);
  return s;
}
export function schemasForTeam(team: string) { return ALL_SCHEMAS.filter(s => s.team === team); }
export function allTeams(): string[] {
  const seen: string[] = [];
  for (const s of ALL_SCHEMAS) if (s.kind !== EMPLOYEE_KIND && !seen.includes(s.team)) seen.push(s.team);
  return seen;
}
```

> The `PORT REQUIRED` comment and the `/* + ... */` marker are **instructions to finish the 1:1 port from `datasets.py`**, not shipped placeholders — the parity test gates completion.

- [ ] **Step 4: Complete the port and run the test until green**

Port the remaining 11 schemas. Run: `npm test -- datasets`
Expected: PASS (4 tests) — only green once all 13 kinds + fields match.

- [ ] **Step 5: Commit**

```bash
git add src/core/datasets.ts src/core/datasets.test.ts
git commit -m "feat(core): port dataset registry to TypeScript (13 kinds, parity-tested)"
```

---

### Task 4: Ingestion (`core/ingest`) — SheetJS parse + type coercion + period parsing

**Files:**
- Create: `src/core/ingest/coerce.ts`, `src/core/ingest/period.ts`, `src/core/ingest/types.ts`, `src/core/ingest/parseWorkbook.ts`
- Test: `src/core/ingest/coerce.test.ts`, `src/core/ingest/period.test.ts`, `src/core/ingest/parseWorkbook.test.ts`

- [ ] **Step 1: Write failing tests for value coercion**

`src/core/ingest/coerce.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { coerce } from "./coerce";

describe("coerce", () => {
  it("parses integers and numbers, stripping commas/currency", () => {
    expect(coerce("integer", "1,200")).toBe(1200);
    expect(coerce("number", "Rs 45,000.50".replace("Rs ", ""))).toBeCloseTo(45000.5);
    expect(coerce("integer", "")).toBeNull();
  });
  it("parses booleans from Y/N/true/false", () => {
    expect(coerce("boolean", "Y")).toBe(true);
    expect(coerce("boolean", "no")).toBe(false);
    expect(coerce("boolean", "")).toBeNull();
  });
  it("parses dates to ISO yyyy-mm-dd", () => {
    expect(coerce("date", new Date(Date.UTC(2026, 4, 31)))).toBe("2026-05-31");
    expect(coerce("date", "2026-04-01")).toBe("2026-04-01");
    expect(coerce("date", "nonsense")).toBeNull();
  });
  it("trims strings and returns null for blank", () => {
    expect(coerce("string", "  hi ")).toBe("hi");
    expect(coerce("string", "   ")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npm test -- coerce` → FAIL.

- [ ] **Step 3: Implement coerce**

`src/core/ingest/coerce.ts`:
```ts
import type { DType } from "../datasets";

const TRUEISH = new Set(["y","yes","true","1","t"]);
const FALSEISH = new Set(["n","no","false","0","f"]);

export function coerce(dtype: DType, value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (dtype === "date") return coerceDate(value);
  if (dtype === "integer" || dtype === "number") {
    if (typeof value === "number") return dtype === "integer" ? Math.trunc(value) : value;
    const cleaned = String(value).replace(/[,\s$]/g, "").replace(/[^\d.\-]/g, "");
    if (cleaned === "") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? (dtype === "integer" ? Math.trunc(n) : n) : null;
  }
  if (dtype === "boolean") {
    const t = String(value).trim().toLowerCase();
    if (t === "") return null;
    if (TRUEISH.has(t)) return true;
    if (FALSEISH.has(t)) return false;
    return null;
  }
  const s = String(value).trim();
  return s === "" ? null : s;
}

function coerceDate(value: unknown): string | null {
  let d: Date | null = null;
  if (value instanceof Date) d = value;
  else {
    const s = String(value).trim();
    if (s === "") return null;
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}
```
> SheetJS is read with `cellDates: true`, so Excel dates arrive as JS `Date`. The numeric cleaner strips currency symbols and separators before parsing.

- [ ] **Step 4: Run to verify pass** — `npm test -- coerce` → PASS.

- [ ] **Step 5: Write failing tests for filename period parsing**

`src/core/ingest/period.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parsePeriod } from "./period";

describe("parsePeriod", () => {
  it("parses an ISO month to last-day + label (month kind)", () => {
    const r = parsePeriod("TA_requisitions_2026-05.xlsx", "month");
    expect(r.asOf).toBe("2026-05-31");
    expect(r.periodLabel).toBe("2026-05");
  });
  it("parses an ISO date directly", () => {
    expect(parsePeriod("Admin_assets_2026-05-10.xlsx", "as_of").asOf).toBe("2026-05-10");
  });
  it("parses an Indian-FY cycle (FY26-H1 -> 30 Sep 2025)", () => {
    const r = parsePeriod("PMS_cycle_FY26-H1.xlsx", "cycle");
    expect(r.asOf).toBe("2025-09-30");
    expect(r.periodLabel).toBe("FY26-H1");
  });
  it("returns null asOf when nothing parses", () => {
    expect(parsePeriod("whatever.xlsx", "month").asOf).toBeNull();
  });
});
```

- [ ] **Step 6: Run to verify fail, then implement period**

Run: `npm test -- period` → FAIL. Create `src/core/ingest/period.ts` (uses `String.match`, not the regex `exec` method):
```ts
export interface ParsedPeriod { asOf: string | null; periodLabel: string | null; confidence: number; note: string; }

const ISO_DATE = /(20\d{2})[-_/.](\d{1,2})[-_/.](\d{1,2})/;
const ISO_MONTH = /(20\d{2})[-_/.](\d{1,2})(?![-_/.]\d)/;
const CYCLE = /(FY\s?\d{2,4}\s?[-_]?\s?(?:H[12]|Q[1-4]|FULL|ANNUAL))/i;

function lastDay(y: number, m: number): string {
  const d = new Date(Date.UTC(y, m, 0)); // day 0 of next month = last day of month m
  return `${y}-${String(m).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}

function cycleToDate(label: string): string | null {
  const m = label.match(/FY\s?(\d{2,4})\s?[-_]?\s?(H[12]|Q[1-4]|FULL|ANNUAL)/i);
  if (!m) return null;
  const yy = parseInt(m[1], 10);
  const fyEnd = yy < 100 ? 2000 + yy : yy; // FY26 -> ends Mar 2026
  const part = m[2].toUpperCase();
  const map: Record<string, string> = {
    H1: `${fyEnd-1}-09-30`, H2: `${fyEnd}-03-31`,
    Q1: `${fyEnd-1}-06-30`, Q2: `${fyEnd-1}-09-30`, Q3: `${fyEnd-1}-12-31`, Q4: `${fyEnd}-03-31`,
    FULL: `${fyEnd}-03-31`, ANNUAL: `${fyEnd}-03-31`,
  };
  return map[part] ?? null;
}

export function parsePeriod(fileName: string, periodKind: "month"|"cycle"|"as_of"): ParsedPeriod {
  const iso = fileName.match(ISO_DATE);
  if (iso) { const v = `${iso[1]}-${iso[2].padStart(2,"0")}-${iso[3].padStart(2,"0")}`;
    return { asOf: v, periodLabel: v, confidence: 1, note: "ISO date in filename." }; }
  if (periodKind === "cycle") { const c = fileName.match(CYCLE);
    if (c) { const label = c[1].replace(/\s+/g,"").toUpperCase(); const d = cycleToDate(label);
      return { asOf: d, periodLabel: label, confidence: d?1:0.6, note: "Review cycle from filename." }; } }
  const mon = fileName.match(ISO_MONTH);
  if (mon) { const y = +mon[1], mo = +mon[2]; if (mo>=1 && mo<=12)
    return { asOf: lastDay(y,mo), periodLabel: `${mon[1]}-${mon[2].padStart(2,"0")}`, confidence: 1, note: "Month from filename." }; }
  return { asOf: null, periodLabel: null, confidence: 0, note: "Could not parse a period from filename." };
}
```
Run: `npm test -- period` → PASS.

- [ ] **Step 7: Write failing test for parseWorkbook (in-memory xlsx)**

`src/core/ingest/parseWorkbook.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseWorkbook } from "./parseWorkbook";
import { TA_REQUISITION } from "../datasets";

function buildXlsx(headers: string[], rows: unknown[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}

describe("parseWorkbook (TA)", () => {
  it("maps label headers to canonical fields, coerces types, parses period", async () => {
    const headers = TA_REQUISITION.fields.map(fld => fld.label);
    const row = TA_REQUISITION.fields.map(fld =>
      fld.name === "requisition_id" ? "REQ-1" :
      fld.name === "department" ? "Tech" :
      fld.name === "job_title" ? "SDE" :
      fld.name === "status" ? "Open" :
      fld.name === "open_date" ? "2026-04-01" :
      fld.name === "applications" ? "50" : "");
    const cand = await parseWorkbook(buildXlsx(headers, [row]), "TA_requisitions_2026-05.xlsx", TA_REQUISITION);
    expect(cand.status).toBe("imported");
    expect(cand.rowCount).toBe(1);
    expect(cand.asOf).toBe("2026-05-31");
    expect(cand.rows[0].requisition_id).toBe("REQ-1");
    expect(cand.rows[0].applications).toBe(50);
    expect(cand.compatibility).toBe("full");
  });

  it("rejects an unrelated sheet", async () => {
    const cand = await parseWorkbook(buildXlsx(["totally","unrelated"], [[1,2]]), "x_2026-05.xlsx", TA_REQUISITION);
    expect(cand.status).toBe("rejected");
  });
});
```

- [ ] **Step 8: Run to verify fail, then implement types + parseWorkbook**

Run: `npm test -- parseWorkbook` → FAIL. Create `src/core/ingest/types.ts`:
```ts
export type Row = Record<string, string | number | boolean | null>;
export interface SnapshotCandidate {
  kind: string; sourceFile: string; asOf: string | null; periodLabel: string | null;
  detectedSheet: string | null; availableColumns: string[]; missingColumns: string[];
  compatibility: "full" | "compatible_with_warnings" | "partial" | "rejected";
  rowCount: number; status: "imported" | "rejected"; rows: Row[]; notes: string[];
}
```
Create `src/core/ingest/parseWorkbook.ts`:
```ts
import * as XLSX from "xlsx";
import { DatasetSchema } from "../datasets";
import { coerce } from "./coerce";
import { parsePeriod } from "./period";
import type { Row, SnapshotCandidate } from "./types";

export async function parseWorkbook(
  data: ArrayBuffer, fileName: string, schema: DatasetSchema, overrideAsOf?: string,
): Promise<SnapshotCandidate> {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const alias = schema.aliasMap();
  const canonical = new Set(schema.columnNames);
  const dtypeByField = new Map(schema.fields.map(fld => [fld.name, fld.dtype] as const));

  let best: { sheet: string; headerRow: number; headers: string[]; score: number } | null = null;
  for (const sheetName of wb.SheetNames) {
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, blankrows: false });
    const scan = Math.min(10, aoa.length);
    for (let r = 0; r < scan; r++) {
      const headers = (aoa[r] || []).map(v => (v == null ? "" : String(v).trim()));
      const mapped = headers.map(h => alias[h.toLowerCase()]).filter((c): c is string => !!c && canonical.has(c));
      const score = new Set(mapped).size;
      if (!best || score > best.score) best = { sheet: sheetName, headerRow: r, headers, score };
    }
  }

  const period = parsePeriod(fileName, schema.periodKind);
  const asOf = overrideAsOf ?? period.asOf;
  const threshold = Math.max(1, Math.min(2, schema.keyFields.length));
  if (!best || best.score < threshold) {
    return reject(schema, fileName, asOf, period.periodLabel, "No sheet matched the template columns.");
  }

  const headerToField = best.headers.map(h => alias[h.toLowerCase()]);
  const available = new Set(headerToField.filter((c): c is string => !!c && canonical.has(c)));
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[best.sheet], { header: 1, blankrows: false });
  const rows: Row[] = [];
  for (let r = best.headerRow + 1; r < aoa.length; r++) {
    const values = (aoa[r] || []) as unknown[];
    const row: Row = Object.fromEntries(schema.columnNames.map(n => [n, null]));
    let hasData = false;
    best.headers.forEach((_, ci) => {
      const field = headerToField[ci];
      if (!field || !canonical.has(field)) return;
      const c = coerce(dtypeByField.get(field)!, values[ci]);
      row[field] = c;
      if (c !== null && c !== "") hasData = true;
    });
    if (!hasData) continue;
    if (schema.keyFields.length && !schema.keyFields.some(k => row[k] !== null && row[k] !== "")) continue;
    rows.push(row);
  }

  const missing = schema.columnNames.filter(c => !available.has(c));
  const compatibility = determineCompatibility(available, schema);
  const status: SnapshotCandidate["status"] = compatibility !== "rejected" && asOf ? "imported" : "rejected";
  return {
    kind: schema.kind, sourceFile: fileName, asOf, periodLabel: overrideAsOf ?? period.periodLabel,
    detectedSheet: best.sheet, availableColumns: [...available].sort(), missingColumns: missing,
    compatibility, rowCount: rows.length, status, rows,
    notes: status === "imported" ? [period.note] : [period.note, "Rejected — missing required columns or period."],
  };
}

function determineCompatibility(available: Set<string>, schema: DatasetSchema): SnapshotCandidate["compatibility"] {
  const required = schema.requiredFields();
  const all = new Set(schema.columnNames);
  const hasAllRequired = [...required].every(c => available.has(c));
  if (hasAllRequired) return [...all].every(c => available.has(c)) ? "full" : "compatible_with_warnings";
  if (schema.keyFields.every(c => available.has(c))) return "partial";
  return "rejected";
}

function reject(schema: DatasetSchema, fileName: string, asOf: string|null, label: string|null, msg: string): SnapshotCandidate {
  return { kind: schema.kind, sourceFile: fileName, asOf, periodLabel: label, detectedSheet: null,
    availableColumns: [], missingColumns: [...schema.columnNames], compatibility: "rejected",
    rowCount: 0, status: "rejected", rows: [], notes: [msg] };
}
```
Run: `npm test -- parseWorkbook` → PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add src/core/ingest
git commit -m "feat(core): schema-driven xlsx ingestion (coerce, period, parseWorkbook)"
```

---

### Task 5: Store + DataSource interface (in-memory snapshots)

**Files:**
- Create: `src/core/store/types.ts`, `src/core/store/memoryStore.ts`
- Test: `src/core/store/memoryStore.test.ts`

- [ ] **Step 1: Write the failing test**

`src/core/store/memoryStore.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { MemoryStore } from "./memoryStore";
import type { Snapshot } from "./types";

const snap = (kind: string, asOf: string, rows: any[]): Snapshot =>
  ({ id: `${kind}:${asOf}`, kind, asOf, periodLabel: asOf, sourceFile: `${kind}.xlsx`, compatibility: "full", rows });

describe("MemoryStore", () => {
  it("adds snapshots and returns the latest per kind by asOf", () => {
    const s = new MemoryStore();
    s.add(snap("ta_requisition", "2026-04-30", [{ requisition_id: "A" }]));
    s.add(snap("ta_requisition", "2026-05-31", [{ requisition_id: "B" }]));
    expect(s.hasKind("ta_requisition")).toBe(true);
    expect(s.getLatest("ta_requisition")!.asOf).toBe("2026-05-31");
    expect(s.listByKind("ta_requisition").length).toBe(2);
  });
  it("dedupes by id (same kind+asOf replaces)", () => {
    const s = new MemoryStore();
    s.add(snap("pms_review", "2026-03-31", [{ a: 1 }]));
    s.add(snap("pms_review", "2026-03-31", [{ a: 2 }]));
    expect(s.listByKind("pms_review").length).toBe(1);
    expect(s.getLatest("pms_review")!.rows[0].a).toBe(2);
  });
  it("getLatest returns null for an unknown kind", () => {
    expect(new MemoryStore().getLatest("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npm test -- memoryStore` → FAIL.

- [ ] **Step 3: Implement types + MemoryStore**

`src/core/store/types.ts`:
```ts
import type { Row } from "../ingest/types";
export interface Snapshot {
  id: string; kind: string; asOf: string; periodLabel: string | null;
  sourceFile: string; compatibility: string; rows: Row[];
}
export interface DataSource {
  add(s: Snapshot): void;
  listByKind(kind: string): Snapshot[];
  getLatest(kind: string): Snapshot | null;
  hasKind(kind: string): boolean;
  allSnapshots(): Snapshot[];
  clear(): void;
}
```
`src/core/store/memoryStore.ts`:
```ts
import type { DataSource, Snapshot } from "./types";

export class MemoryStore implements DataSource {
  private snaps = new Map<string, Snapshot>();
  add(s: Snapshot): void { this.snaps.set(s.id, s); }
  allSnapshots(): Snapshot[] { return [...this.snaps.values()]; }
  listByKind(kind: string): Snapshot[] {
    return this.allSnapshots().filter(s => s.kind === kind).sort((a, b) => a.asOf.localeCompare(b.asOf));
  }
  getLatest(kind: string): Snapshot | null {
    const list = this.listByKind(kind);
    return list.length ? list[list.length - 1] : null;
  }
  hasKind(kind: string): boolean { return this.allSnapshots().some(s => s.kind === kind); }
  clear(): void { this.snaps.clear(); }
}
```
Run: `npm test -- memoryStore` → PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add src/core/store
git commit -m "feat(core): in-memory store behind a DataSource interface (Phase-B seam)"
```

---

### Task 6: Workspace save/load (gzipped JSON incl. branding)

**Files:**
- Create: `src/workspace/workspace.ts`
- Test: `src/workspace/workspace.test.ts`

- [ ] **Step 1: Write the failing test**

`src/workspace/workspace.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { MemoryStore } from "../core/store/memoryStore";
import { DEFAULT_BRANDING } from "../branding/branding";
import { saveWorkspace, loadWorkspace } from "./workspace";

describe("workspace round-trip", () => {
  it("serializes store + branding to bytes and restores them", () => {
    const store = new MemoryStore();
    store.add({ id: "employee_master:2026-03-06", kind: "employee_master", asOf: "2026-03-06",
      periodLabel: "2026-03-06", sourceFile: "emp.xlsx", compatibility: "full",
      rows: [{ employee_number: "AA1", full_name: "A B", department: "Tech" }] });
    const brand = { ...DEFAULT_BRANDING, appName: "Acme HR", primary: "#111111" };

    const bytes = saveWorkspace(store, brand);
    expect(bytes.byteLength).toBeGreaterThan(0);

    const restored = loadWorkspace(bytes);
    expect(restored.branding.appName).toBe("Acme HR");
    expect(restored.store.getLatest("employee_master")!.rows[0].employee_number).toBe("AA1");
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npm test -- workspace` → FAIL.

- [ ] **Step 3: Implement workspace**

`src/workspace/workspace.ts`:
```ts
import pako from "pako";
import { MemoryStore } from "../core/store/memoryStore";
import type { DataSource, Snapshot } from "../core/store/types";
import { DEFAULT_BRANDING, type Branding } from "../branding/branding";

const FORMAT = "hr-analytics-workspace";

interface WorkspaceFile { format: string; version: 1; generatedAt: string; branding: Branding; snapshots: Snapshot[]; }

export function saveWorkspace(store: DataSource, branding: Branding, now = "1970-01-01T00:00:00Z"): Uint8Array {
  const payload: WorkspaceFile = { format: FORMAT, version: 1, generatedAt: now, branding, snapshots: store.allSnapshots() };
  return pako.gzip(JSON.stringify(payload));
}

export function loadWorkspace(bytes: Uint8Array): { store: MemoryStore; branding: Branding } {
  const json = pako.ungzip(bytes, { to: "string" });
  const parsed = JSON.parse(json) as WorkspaceFile;
  if (parsed.format !== FORMAT) throw new Error("Not a valid HR Analytics workspace file.");
  const store = new MemoryStore();
  for (const s of parsed.snapshots ?? []) store.add(s);
  return { store, branding: { ...DEFAULT_BRANDING, ...(parsed.branding ?? {}) } };
}
```
> `now` is injected (default fixed) so tests are deterministic; the UI passes `new Date().toISOString()`.

Run: `npm test -- workspace` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/workspace
git commit -m "feat: workspace save/load (gzipped JSON incl. branding), round-trip tested"
```

---

### Task 7: Minimal UI shell — upload, brand, overview, save/load, single-file build

**Files:**
- Create: `src/core/metrics/overview.ts` + `src/core/metrics/overview.test.ts`
- Create: `src/ui/theme.css`, `src/ui/state.tsx`, `src/ui/AppShell.tsx`, `src/ui/pages/DataIntake.tsx`, `src/ui/pages/Branding.tsx`, `src/ui/pages/Overview.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write a failing test for the overview KPIs (pure)**

`src/core/metrics/overview.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { overviewKpis } from "./overview";

describe("overviewKpis", () => {
  it("counts active/relieved and ratios", () => {
    const rows = [
      { employment_status: "Working" }, { employment_status: "Working" },
      { employment_status: "Relieved" },
    ];
    const k = overviewKpis(rows as any);
    expect(k.total).toBe(3);
    expect(k.active).toBe(2);
    expect(k.relieved).toBe(1);
    expect(k.activeRatio).toBeCloseTo(66.7, 1);
  });
});
```

- [ ] **Step 2: Run to verify fail, then implement overview**

Run: `npm test -- overview` → FAIL. Create `src/core/metrics/overview.ts`:
```ts
import type { Row } from "../ingest/types";

export interface OverviewKpis { total: number; active: number; relieved: number; activeRatio: number; relievedRatio: number; }

export function overviewKpis(rows: Row[]): OverviewKpis {
  const total = rows.length;
  const active = rows.filter(r => r.employment_status === "Working").length;
  const relieved = rows.filter(r => r.employment_status === "Relieved").length;
  const pct = (n: number) => total ? Math.round((n / total) * 1000) / 10 : 0;
  return { total, active, relieved, activeRatio: pct(active), relievedRatio: pct(relieved) };
}
```
Run: `npm test -- overview` → PASS.

- [ ] **Step 3: Implement app state (store + branding context)**

`src/ui/state.tsx`:
```tsx
import React, { createContext, useContext, useState, useCallback } from "react";
import { MemoryStore } from "../core/store/memoryStore";
import { applyBranding, DEFAULT_BRANDING, type Branding } from "../branding/branding";

interface AppState {
  store: MemoryStore; version: number; branding: Branding;
  bump(): void; setStore(s: MemoryStore): void; setBranding(b: Branding): void;
}
const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [store, setStoreRaw] = useState(() => new MemoryStore());
  const [branding, setBrandingRaw] = useState<Branding>(DEFAULT_BRANDING);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);
  const setStore = useCallback((s: MemoryStore) => { setStoreRaw(s); setVersion(v => v + 1); }, []);
  const setBranding = useCallback((b: Branding) => { setBrandingRaw(b); applyBranding(b); }, []);
  return <Ctx.Provider value={{ store, version, branding, bump, setStore, setBranding }}>{children}</Ctx.Provider>;
}
export function useApp() { const v = useContext(Ctx); if (!v) throw new Error("AppStateProvider missing"); return v; }
```

- [ ] **Step 4: Implement theme.css (brand CSS variables)**

`src/ui/theme.css`:
```css
:root { --brand-primary: #1f2937; --brand-accent: #2563eb; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, "Segoe UI", system-ui, sans-serif; color: #152033; background: #f6f8fb; }
.app { display: grid; grid-template-columns: 240px 1fr; min-height: 100vh; }
.sidebar { background: #fff; border-right: 1px solid rgba(21,32,51,.08); padding: 16px; }
.sidebar a { display: block; padding: 8px 10px; border-radius: 8px; color: #152033; text-decoration: none; }
.sidebar a.active { background: var(--brand-primary); color: #fff; }
.content { padding: 24px 28px; }
.brandbar { color: var(--brand-accent); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: .72rem; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 14px; }
.kpi { background:#fff; border:1px solid rgba(21,32,51,.08); border-radius:12px; padding:14px 16px; }
.kpi .label { color:#667085; font-size:.74rem; text-transform:uppercase; font-weight:600; }
.kpi .value { font-size:1.6rem; font-weight:800; }
button.primary { background: var(--brand-accent); color:#fff; border:0; border-radius:8px; padding:8px 14px; cursor:pointer; }
```

- [ ] **Step 5: Implement the three pages**

`src/ui/pages/DataIntake.tsx`:
```tsx
import React, { useState } from "react";
import { parseWorkbook } from "../../core/ingest/parseWorkbook";
import { EMPLOYEE_MASTER } from "../../core/datasets";
import { useApp } from "../state";

export function DataIntake() {
  const { store, bump } = useApp();
  const [msg, setMsg] = useState("");
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const cand = await parseWorkbook(await file.arrayBuffer(), file.name, EMPLOYEE_MASTER);
    if (cand.status === "imported" && cand.asOf) {
      store.add({ id: `${cand.kind}:${cand.asOf}`, kind: cand.kind, asOf: cand.asOf,
        periodLabel: cand.periodLabel, sourceFile: cand.sourceFile, compatibility: cand.compatibility, rows: cand.rows });
      bump(); setMsg(`Imported ${cand.rowCount} rows (as of ${cand.asOf}).`);
    } else setMsg(`Could not import: ${cand.notes.join(" ")}`);
  }
  return (<div><h2>Data Intake</h2>
    <p>Upload the employee master workbook (.xlsx).</p>
    <input type="file" accept=".xlsx" onChange={onFile} />
    {msg && <p>{msg}</p>}</div>);
}
```
`src/ui/pages/Branding.tsx`:
```tsx
import React from "react";
import { useApp } from "../state";

export function BrandingPage() {
  const { branding, setBranding } = useApp();
  return (<div><h2>Branding</h2>
    <p><label>App name <input value={branding.appName}
      onChange={e => setBranding({ ...branding, appName: e.target.value })} /></label></p>
    <p><label>Primary colour <input type="color" value={branding.primary}
      onChange={e => setBranding({ ...branding, primary: e.target.value })} /></label></p>
    <p><label>Accent colour <input type="color" value={branding.accent}
      onChange={e => setBranding({ ...branding, accent: e.target.value })} /></label></p>
    <p><label>Logo <input type="file" accept="image/*" onChange={e => {
      const file = e.target.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setBranding({ ...branding, logoDataUri: String(reader.result) });
      reader.readAsDataURL(file);
    }} /></label></p>
    {branding.logoDataUri && <img src={branding.logoDataUri} alt="logo" style={{ height: 40 }} />}
  </div>);
}
```
`src/ui/pages/Overview.tsx`:
```tsx
import React from "react";
import { useApp } from "../state";
import { overviewKpis } from "../../core/metrics/overview";

export function Overview() {
  const { store } = useApp();
  const latest = store.getLatest("employee_master");
  if (!latest) return <div><h2>Overview</h2><p>No employee data yet — upload it on Data Intake.</p></div>;
  const k = overviewKpis(latest.rows);
  const card = (label: string, value: string) => (
    <div className="kpi" key={label}><div className="label">{label}</div><div className="value">{value}</div></div>);
  return (<div><h2>Overview</h2><div className="kpis">
    {card("Rows", k.total.toLocaleString())}
    {card("Active headcount", k.active.toLocaleString())}
    {card("Relieved", k.relieved.toLocaleString())}
    {card("Active ratio", `${k.activeRatio}%`)}
  </div></div>);
}
```

- [ ] **Step 6: Implement AppShell (nav + save/load) and wire App.tsx**

`src/ui/AppShell.tsx`:
```tsx
import React, { useState } from "react";
import "./theme.css";
import { useApp } from "./state";
import { Overview } from "./pages/Overview";
import { DataIntake } from "./pages/DataIntake";
import { BrandingPage } from "./pages/Branding";
import { saveWorkspace, loadWorkspace } from "../workspace/workspace";

const PAGES = ["Overview", "Data Intake", "Branding"] as const;
type Page = typeof PAGES[number];

export function AppShell() {
  const app = useApp();
  const [page, setPage] = useState<Page>("Overview");

  function onSave() {
    const bytes = saveWorkspace(app.store, app.branding, new Date().toISOString());
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/gzip" }));
    const a = document.createElement("a"); a.href = url; a.download = "hr-workspace.json.gz"; a.click();
    URL.revokeObjectURL(url);
  }
  async function onLoad(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const { store, branding } = loadWorkspace(new Uint8Array(await file.arrayBuffer()));
    app.setStore(store); app.setBranding(branding);
  }
  return (<div className="app">
    <nav className="sidebar">
      <div className="brandbar">{app.branding.appName}</div>
      {app.branding.logoDataUri && <img src={app.branding.logoDataUri} alt="" style={{ height: 32, margin: "8px 0" }} />}
      {PAGES.map(p => <a key={p} className={p === page ? "active" : ""} href="#"
        onClick={ev => { ev.preventDefault(); setPage(p); }}>{p}</a>)}
      <hr/>
      <button className="primary" onClick={onSave}>Save workspace</button>
      <div style={{ marginTop: 8 }}><label>Load workspace<br/><input type="file" accept=".gz,.json" onChange={onLoad} /></label></div>
    </nav>
    <main className="content">
      {page === "Overview" && <Overview />}
      {page === "Data Intake" && <DataIntake />}
      {page === "Branding" && <BrandingPage />}
      <footer style={{ marginTop: 32, color: "#667085", fontSize: ".82rem" }}>{app.branding.footer}</footer>
    </main>
  </div>);
}
```
Replace `src/App.tsx`:
```tsx
import { AppStateProvider } from "./ui/state";
import { AppShell } from "./ui/AppShell";
export function App() { return <AppStateProvider><AppShell /></AppStateProvider>; }
```

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS (branding, datasets, coerce, period, parseWorkbook, memoryStore, workspace, overview).

- [ ] **Step 8: Build the single file and smoke-test in a browser**

```bash
npm run build
```
Expected: `dist/index.html` (single self-contained file). Open it (double-click or `npm run preview`), then:
- Data Intake → upload `legacy/python/HR_Analytics_Employee_Template.xlsx` (or a real employee master) → "Imported N rows".
- Overview → KPI cards populate.
- Branding → change name/colour → sidebar + accents update live.
- Save workspace → downloads `hr-workspace.json.gz`; reload the page; Load workspace → data + branding restored.

- [ ] **Step 9: Commit & push**

```bash
git add -A
git commit -m "feat(ui): minimal shell — data intake, overview, branding, workspace save/load, single-file build"
git push -u origin feat/browser-foundation
```
Then open a PR into `main`.

---

## Definition of done (Plan 1)

- `npm test` green; `npm run build` emits one self-contained `dist/index.html`.
- The built file (from `file://`) ingests an employee-master workbook, shows Overview KPIs, rebrands live, and round-trips a workspace file.
- Python app preserved under `legacy/python/`; proprietary `LICENSE` + rewritten `README.md` in place.
- Branch pushed; PR opened.

## Notes for Plans 2 & 3

- **Plan 2:** add Plotly.js (`src/core/charts.ts`), port `metrics/*` + `analytics.ts` + cross-functional to `src/core/metrics/`, add per-domain Data Intake (all kinds) and the Function Analytics page + dashboard pages; port the Python domain tests to Vitest.
- **Plan 3:** port `narrative.ts` + `newsletter/` (Reports page: view/print/download), the remaining parity pages, and a Playwright build-verification test driving the built single file.
```
