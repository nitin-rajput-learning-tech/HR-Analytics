import type { DataSource, Snapshot } from "./types";

export class MemoryStore implements DataSource {
  private snaps = new Map<string, Snapshot>();

  add(s: Snapshot): void {
    this.snaps.set(s.id, s);
  }
  allSnapshots(): Snapshot[] {
    return [...this.snaps.values()];
  }
  listByKind(kind: string): Snapshot[] {
    return this.allSnapshots()
      .filter((s) => s.kind === kind)
      .sort((a, b) => a.asOf.localeCompare(b.asOf));
  }
  getLatest(kind: string): Snapshot | null {
    const list = this.listByKind(kind);
    return list.length ? list[list.length - 1] : null;
  }
  hasKind(kind: string): boolean {
    return this.allSnapshots().some((s) => s.kind === kind);
  }
  clear(): void {
    this.snaps.clear();
  }
}
