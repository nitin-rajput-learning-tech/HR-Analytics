import type { Row } from "../ingest/types";

export interface OverviewKpis {
  total: number;
  active: number;
  relieved: number;
  activeRatio: number;
  relievedRatio: number;
}

export function overviewKpis(rows: Row[]): OverviewKpis {
  const total = rows.length;
  const active = rows.filter((r) => r.employment_status === "Working").length;
  const relieved = rows.filter((r) => r.employment_status === "Relieved").length;
  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  return { total, active, relieved, activeRatio: pct(active), relievedRatio: pct(relieved) };
}
