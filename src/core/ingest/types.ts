import type { RowIssue } from "./validate";

export type Row = Record<string, string | number | boolean | null>;

export interface SnapshotCandidate {
  kind: string;
  sourceFile: string;
  asOf: string | null;
  periodLabel: string | null;
  detectedSheet: string | null;
  availableColumns: string[];
  missingColumns: string[];
  compatibility: "full" | "compatible_with_warnings" | "partial" | "rejected";
  rowCount: number;
  status: "imported" | "rejected";
  rows: Row[];
  notes: string[];
  // Row-level validation findings (enum / required / type). Advisory — flagged
  // rows still import, but the user sees them in the pre-import preview.
  issues: RowIssue[];
  rowsWithIssues: number;
}
