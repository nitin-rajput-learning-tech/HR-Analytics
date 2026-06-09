// Action-tracking model (BUILD-2) — turns HR Brain roadmap recommendations into
// assignable, status-tracked commitments so insight becomes managed follow-through.
// Pure domain model + helpers; persistence lives in the workspace, UI in the page.

export type ActionStatus = "open" | "in_progress" | "done";

export const ACTION_STATUSES: ActionStatus[] = ["open", "in_progress", "done"];
export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  done: "Done",
};

export interface Action {
  id: string;
  title: string;
  owner: string;
  status: ActionStatus;
  due: string | null; // ISO date, or null
  note: string; // first step / context
  source: "brain" | "manual";
  findingId: string | null; // links back to the Brain finding/roadmap item it came from
  createdAt: string; // ISO timestamp
  doneAt: string | null; // ISO timestamp when marked done
}

export interface ActionSummary {
  total: number;
  open: number;
  in_progress: number;
  done: number;
  overdue: number; // not done and past due
}

// Roll a list of actions into status counts (+ overdue), relative to a reference date.
export function actionSummary(actions: Action[], asOf: string): ActionSummary {
  const ref = Date.parse(asOf);
  const s: ActionSummary = { total: actions.length, open: 0, in_progress: 0, done: 0, overdue: 0 };
  for (const a of actions) {
    s[a.status] += 1;
    if (a.status !== "done" && a.due) {
      const d = Date.parse(a.due);
      if (!Number.isNaN(d) && !Number.isNaN(ref) && d < ref) s.overdue += 1;
    }
  }
  return s;
}

// Create an Open action from a Brain roadmap item. The findingId links it back so the
// Brain can show "committed vs done" and avoid duplicate actions for the same finding.
export function actionFromRoadmap(
  item: { id: string; title: string; owner: string; firstAction?: string },
  nowIso: string,
): Action {
  return {
    id: `act-${item.id}-${nowIso}`,
    title: item.title,
    owner: item.owner,
    status: "open",
    due: null,
    note: item.firstAction ?? "",
    source: "brain",
    findingId: item.id,
    createdAt: nowIso,
    doneAt: null,
  };
}

// Apply a status change immutably, stamping/clearing doneAt as appropriate.
export function withStatus(action: Action, status: ActionStatus, nowIso: string): Action {
  return { ...action, status, doneAt: status === "done" ? nowIso : null };
}

// Has a (still-open) action already been created for this finding? Prevents the
// "add to actions" affordance from creating duplicates.
export function hasOpenActionForFinding(actions: Action[], findingId: string): boolean {
  return actions.some((a) => a.findingId === findingId && a.status !== "done");
}
