# Reports Suite — Plan (Keka-parity report library)

Status: **proposal / working spec** (no code yet). Goal: grow our white-label HR
analytics tool into a Keka-style **report library** — a discoverable Reports hub
plus a broad catalogue of performance-management reports — built on the same
patterns we already use (dataset-kind registry → pure `compute()` →
`DomainMetrics` → `DomainView`, with filters / sortable tables / charts / CSV).

---

## 1. What Keka's catalogue actually is

The pasted Keka catalogue is overwhelmingly a **performance-review reporting
suite** sitting on a few data spines:

| Keka category | Data spine | Today |
|---|---|---|
| **Review reports** (~28) | review cycles → per-employee, per-**competency/section** ratings; **performance bands**; **calibration**; multiple reviewers; multi-cycle history | ❌ only flat `pms_review` (one final rating per employee/cycle) |
| **KRAs** | goals → sub-goals → tasks; KPIs; weights; status | ❌ none |
| **Feedback** | feedback / praise / requests / internal notes | ❌ none |
| **1:1 Meeting** | manager↔employee meetings, status, notes | ❌ none |
| **Skill Reports** | employee ↔ skill ↔ proficiency | ❌ none |
| **Miscellaneous** | review-cycle eligibility, perf info | ⚠️ partial |
| **Reports Home** | a **hub**: categories, favourites, recently-used, search, custom builder, scheduling | ❌ fixed pages, no hub |

Two gaps: **(A) richer data domains** (above all a review/competency/calibration
model) and **(B) a Reports hub** to surface everything like Keka.

## 2. Key design principle — parameterized builders, not 28 one-offs

Most "Review reports" are one computation sliced differently (by
department/team/company; single vs multiple cycles; band distribution
overall/dept/calibrator). We build a **handful of `compute(rows, params)`
builders** (our existing `DomainMetrics` pattern) and expose each slice as a
named **report** in the hub.

```
ReportDef = {
  id, category, title, description,
  inputs: kinds[],            // dataset kinds it needs
  params: ParamSpec[],        // e.g. dimension, cycle, ratingWindow
  build(store, params) => DomainMetrics,
  favourite?, lastUsed?       // persisted in workspace
}
```

The hub renders the `ReportDef` registry (search/favourite/recent); each report
renders its `DomainMetrics` through the existing `DomainView` + filters + CSV.

---

## 3. New dataset templates (the gating dependency)

Each is a new entry in `src/core/datasets.ts` (intake template + data
dictionary) plus a `metrics/*` builder — exactly like our 13 current kinds.

### 3.1 `review_rating` (detail — the keystone)
One row per **employee × cycle × competency/section × reviewer**. Unlocks ~18
review reports on its own.

| field | type | notes |
|---|---|---|
| employee_number | str (req) | FK → employee master |
| cycle | str (req) | e.g. `FY26-H1` (enables multi-instance trends) |
| review_group | str | e.g. Self/Manager review group / template name |
| reviewer_type | str | Self / Manager / Peer / Skip / **Final** |
| section | str | competency group (e.g. "Leadership") |
| competency | str | line item (e.g. "Decision making") |
| question | str | optional, finer than competency → questions report |
| rating | number | numeric on `scale` |
| rating_scale | str | e.g. `1-5` |
| weight | number | section/competency weight % |
| status | str | Draft / Submitted / Completed / **Cancelled** |
| calibrator | str | who calibrated → calibrator distribution |
| performance_band | str | Exceeds / Meets / Below (or custom) |
| comment | str | optional |

### 3.2 `review_cycle` (cycle metadata + eligibility)
cycle, name, type (Annual/H1/Quarterly), start_date, end_date, status
(Open/Calibration/Closed), eligible_employee_count. → "employees without review
cycles", form-status denominators.

### 3.3 `goal_kra`
employee_number, item_id, parent_id (hierarchy), item_type (KRA/Goal/Sub-goal/
Task/KPI), title, cycle, weight, target, actual, unit, progress_pct, status
(Not started/In progress/Completed/Overdue), rating, owner. → all KRA reports +
goals-rating.

### 3.4 `skill_assignment`
employee_number, skill, category, proficiency (1-5 or Beginner..Expert),
required_level, assessed_on, assessor. → skills matrix, gap (proficiency <
required), **employees with no skills** (anti-join vs employee master).

### 3.5 `feedback`
feedback_id, type (Feedback/Praise/Request/Note), from_employee, to_employee,
date, status (Requested/Pending/Submitted/Declined), visibility, competency,
text. → feedbacks, praises, requests & status, internal notes.

### 3.6 `one_on_one`
meeting_id, manager, employee, scheduled_date, held_date, status (Scheduled/
Completed/Cancelled/Missed), action_items, notes_count, meeting_type
(`1:1`/`Review`). → 1:1 info, meetings-by-manager, review-meeting summary.

> Trends "over multiple review instances" need **no snapshot-diffing** — the
> `cycle` column carries history, so we group/stack (simpler than Movement).

---

## 4. Report catalogue → builders (full mapping)

### Review reports (over `review_rating` (+ `review_cycle`))

| Keka report | Builder | Params |
|---|---|---|
| Assignment of performance bands in a cycle | `bandAssignment` | cycle |
| Distribution of employees in bands | `bandDistribution` | dimension=overall |
| Department-wise distribution in bands | `bandDistribution` | dimension=department |
| Calibrator-wise distribution in bands | `bandDistribution` | dimension=calibrator |
| Department-Wise Average Ratings In A Cycle | `avgRatings` | dim=department, single |
| Team-Wise Average Ratings In A Cycle | `avgRatings` | dim=manager, single |
| Department Avg Ratings over multiple instances | `avgRatings` | dim=department, multi |
| Team Avg Rating over multiple instances | `avgRatings` | dim=manager, multi |
| Company Avg Rating Trends for Competencies | `competencyTrends` | scope=company |
| Employee Trends for a Given Competency | `competencyTrends` | scope=employee, competency |
| Employee Trends of Competencies (rating window) | `competencyTrends` | window |
| Cumulative Section Wise Rating | `sectionWise` | cycle |
| Employee Distribution by Competencies (rating window) | `competencyDistribution` | window |
| Employee Distribution by Ratings for Competencies | `competencyDistribution` | competency |
| Employee Review Rating Report | `employeeRatings` | cycle |
| Employee review ratings over multiple instances | `employeeRatings` | multi |
| Employee Review Form Status | `reviewStatus` | view=form |
| Employee Review Status Info | `reviewStatus` | view=review |
| Employee Cancelled Reviews / Rating | `reviewStatus` | view=cancelled |
| Employee Reviewer Override | `reviewerOverride` | compare Manager vs Final |
| Consolidated Employee Appraisal | `consolidated` | per-employee, all sections |
| Consolidated Review Rating | `consolidated` | multi-review |
| Multiple Review Groups Rating | `consolidated` | by review_group |
| Employee Reviews (detailed) | `employeeReviewDetail` | employee |
| Questions Rating Report | `questionsRating` | needs `question` grain |
| Goals rating report | `goalsRating` | from `goal_kra` |
| Review Meeting Summary | `reviewMeetingSummary` | from `one_on_one` type=Review |

→ ~10 builders cover all ~28.

### KRAs (over `goal_kra`)
Employee-Wise KRA Status · Goals/Sub-goals/Tasks · KRAs Report · KRAs with KPIs
→ builders `kraStatus`, `goalHierarchy`, `kpiRollup`.

### Feedback (over `feedback`)
Employee Feedbacks · Praises · Requests & status · Internal Notes →
`feedbackSummary` (param: type) + `feedbackRequests`.

### 1:1 (over `one_on_one`)
1:1 Meeting Information · Meetings by Manager → `meetingInfo`, `meetingsByManager`.

### Skills (over `skill_assignment`)
Employees With No Skills Assigned (anti-join) · Skill matrix · Skill-gap →
`noSkills`, `skillMatrix`, `skillGap`.

### Miscellaneous
Employees Without Review Cycles (`review_cycle` eligibility anti-join) ·
Employee Performance Information (cross-join people + ratings + goals + skills).

---

## 5. Reports Hub (the "Reports Home" UX)

A new top-level **Reports** page reframing the app around discoverable reports:

- **Category sidebar** (People, Review, KRA, Skills, Feedback, 1:1, Operations,
  Custom) + **global search** across report titles/descriptions.
- **★ Favourites** and **Recently used** (persisted in the workspace).
- Each report opens **parameterized** (cycle / department / dimension / rating
  window pickers) and reuses existing **filters, sortable tables, charts, CSV**.
- **"Create custom report"** → builder: pick a dataset kind → choose columns +
  filters + group-by + chart → save as a named `ReportDef` in the workspace.
- Reports with missing inputs show an "awaiting data — get the template" state
  (same graceful pattern as today).

Our current pages become reports in the hub: People's 9 tabs, the 5 functional
domains, cross-functional, and the newsletter all register as `ReportDef`s.

## 6. "Scheduled reports" — honest constraint

We're **offline / server-less** (a single HTML file), so true cron scheduling is
impossible. Realistic equivalent: **Saved reports** = report definitions (params
+ filters) stored in the workspace, a "Due / pinned" list, and one-click
run + export. We'll label it "Saved reports", not promise server scheduling.

## 7. Phased roadmap

- **Phase 1 — Reports Hub shell** (no new data): `ReportDef` registry + hub UI
  (categories, search, favourites, recently-used) cataloguing today's analytics.
  Fast visible win; the frame everything slots into.
- **Phase 2 — Review/competency model**: `review_rating` + `review_cycle`
  templates + ~10 review builders + hub entries + a `Generate demo data`
  extension so it populates from the loaded employee master.
- **Phase 3 — KRA, Skills, Feedback, 1:1**: four templates + builders + entries.
- **Phase 4 — Custom report builder + Saved reports.**

Each phase ships: template(s) in `datasets.ts`, pure verifiable builders
(`tsc` + node harness + vitest), hub registration, demo-data coverage, and a
browser check — same workflow as everything to date.

## 8. Open questions for refinement

1. **Review data grain** — do teams export per-competency rows (rich, enables
   most reports) or only a final rating per employee (limits to band/avg/status)?
   This decides how much of Phase 2 is reachable.
2. **Performance bands** — explicit `performance_band` column, or derive from
   rating thresholds we configure (e.g. ≥4.5 Exceeds)? (Propose: accept the
   column; derive if absent.)
3. **Calibration** — is `calibrator` a real field your teams have, or skip
   calibrator-wise reports for now?
4. **KRA hierarchy** — flat list with `parent_id`, or separate goal/task sheets?
5. **Custom report builder depth** — full column/group/chart builder, or start
   with "save a filtered view as a report"?
6. Priorities: which category delivers the most value to the CHRO + the five
   function heads first?

---

### Appendix — architecture touchpoints (for when we build)
- `src/core/datasets.ts` — add the 6 new `DatasetSchema`s (+ header aliases, dictionaries).
- `src/core/metrics/review.ts`, `kra.ts`, `skills.ts`, `feedback.ts`, `oneonone.ts` — pure builders returning `DomainMetrics` / `DomainMetrics[]`.
- `src/reports/registry.ts` — the `ReportDef` registry + categories.
- `src/ui/pages/Reports*` — hub page (rename current Newsletter "Reports" to "Newsletter"; new "Reports" = the hub) reusing `DomainView` / `FilterBar` / `charts`.
- `src/core/intake/demoData.ts` — extend to synthesise review/KRA/skill/feedback/1:1 from the employee master.
- `workspace.ts` — persist favourites / recently-used / saved report defs.
