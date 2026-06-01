# Sample data (synthetic)

Fully **synthetic** demo data for exercising the tool before real data arrives —
no real PII. One coherent 150-employee roster (135 active) across 8 departments;
every domain is keyed to the same `employee_number`s and departments so joins and
cross-functional risk produce real signal.

Regenerate (deterministic — same output every run):

```bash
npm run sample-data        # rewrites the .xlsx files below into sample-data/
```

## Files

| File | Domain | Rows |
|---|---|---|
| `Employee report as on 2026-05-05.xlsx` | Employee Master | 150 |
| `TA_requisitions_2026-05.xlsx` | Talent Acquisition | 26 |
| `PMS_cycle_FY26-H1.xlsx` | Performance (PMS) | 135 |
| `Payroll_aggregate_2026-05.xlsx` | Payroll — Dept Aggregate | 8 |
| `Payroll_statutory_2026-05.xlsx` | Payroll — Statutory | 5 |
| `LD_programs_2026-05.xlsx` | L&D — Programs | 10 |
| `LD_enrollments_2026-05.xlsx` | L&D — Enrollments | 184 |
| `Admin_assets_2026-05-05.xlsx` | HR Admin — Assets | 197 |
| `Admin_contracts_2026-05-05.xlsx` | HR Admin — Contracts | 16 |
| `Admin_lifecycle_2026-05.xlsx` | HR Admin — On/Off-boarding | 22 |

## Quickest way to see the whole tool

`Airpay-HR-sample-workspace.json.gz` is a pre-loaded workspace containing **all 10
datasets** plus branding. In the app, click **Load workspace** and pick it — every
dashboard and the newsletter populate instantly. (Built from the workbooks above via
the app's own parse + save; deterministic, so it always matches them.)

Otherwise: on **Data Intake**, pick each domain and upload its workbook one by one.

## What the data is designed to show

The numbers are realistic and deliberately seeded with issues so every analytic
path lights up:
- **Talent Acquisition** — a few requisitions aged >90 days (aging watch-out).
- **Payroll** — one late + one pending statutory filing; a couple of payroll errors.
- **L&D** — mandatory/compliance completion ~85% (incomplete-training watch-out).
- **HR Admin** — expired + soon-to-expire contracts; a few lost assets; offboarding
  asset-recovery gaps.
- **Cross-Functional** — **Sales** is biased to low training coverage *and* low review
  completion, so it surfaces as the top compound-risk department in the newsletter.

> Run over `npm run serve` (http://localhost:4173) or host on https — not `file://`,
> where Chrome blocks the template/workspace downloads.
