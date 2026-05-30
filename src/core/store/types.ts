import type { Row } from "../ingest/types";

export interface Snapshot {
  id: string;
  kind: string;
  asOf: string;
  periodLabel: string | null;
  sourceFile: string;
  compatibility: string;
  rows: Row[];
}

export interface DataSource {
  add(s: Snapshot): void;
  listByKind(kind: string): Snapshot[];
  getLatest(kind: string): Snapshot | null;
  hasKind(kind: string): boolean;
  allSnapshots(): Snapshot[];
  clear(): void;
}
