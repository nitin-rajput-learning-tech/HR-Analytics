# Acme HR Analytics — Sample Intake Pack

A fully **synthetic** demo dataset modelled on the shape of a real Indian payments
employer (entity mix, field-sales-heavy workforce, deep hierarchy, gender skew,
attrition concentrated in frontline sales). **No real employee data** — every name,
email and ID is generated, so this pack is safe to share.

Use it to demonstrate live ingestion: open the tool, go to **Data Intake**, pick the
matching dataset kind, and upload the file. Headers use each domain's standard labels,
so they map automatically. Upload in the numbered order below for the smoothest demo
(the two employee-master months first — they unlock Movement, Forecast and trends).

| # | File | Dataset kind to select | Team | Rows |
|---|------|------------------------|------|------|
| 1 | `01_Employee_Master_2026-04-05.xlsx` | Employee Master | Core People | 459 |
| 2 | `02_Employee_Master_2026-05-05.xlsx` | Employee Master | Core People | 473 |
| 3 | `03_Talent_Acquisition_Requisitions_2026-05.xlsx` | Talent Acquisition — Requisitions | Talent Acquisition | 15 |
| 4 | `04_Performance_Review_Cycle_FY26-H1.xlsx` | Performance — Review Cycle | Performance | 353 |
| 5 | `05_Payroll_Per_Employee_Detail_2026-05.xlsx` | Payroll — Per-Employee Detail | Payroll | 353 |
| 6 | `06_Payroll_Department_Aggregate_2026-05.xlsx` | Payroll — Department Aggregate | Payroll | 11 |
| 7 | `07_Payroll_Statutory_Compliance_2026-05.xlsx` | Payroll — Statutory Compliance | Payroll | 5 |
| 8 | `08_L_D_Programs_2026-05.xlsx` | L&D — Programs | L&D | 10 |
| 9 | `09_L_D_Enrollments_2026-05.xlsx` | L&D — Enrollments | L&D | 409 |
| 10 | `10_HR_Admin_Assets_2026-05.xlsx` | HR Admin — Assets | HR Admin | 478 |
| 11 | `11_HR_Admin_Contracts_AMC_2026-05.xlsx` | HR Admin — Contracts & AMC | HR Admin | 16 |
| 12 | `12_HR_Admin_Onboarding_Offboarding_2026-05.xlsx` | HR Admin — Onboarding/Offboarding | HR Admin | 22 |
| 13 | `13_Engagement_Survey_2026-05.xlsx` | Engagement — Survey | Engagement | 233 |
| 14 | `14_Planning_Headcount_Plan_2026-05.xlsx` | Planning — Headcount Plan | Planning | 11 |

**Notes**
- *Payroll* offers two grains — upload **Per-Employee Detail** OR **Department Aggregate**
  (a team shares whichever it can); the Statutory file drives the compliance calendar.
- *Performance* is a half-yearly cycle (FY26-H1); *Engagement* is quarterly — both are
  single-period by design.
- The numbers here match the built-in showroom workspace, so cross-tab figures line up.
