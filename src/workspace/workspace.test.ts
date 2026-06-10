import { describe, it, expect } from "vitest";
import pako from "pako";
import { MemoryStore } from "../core/store/memoryStore";
import { DEFAULT_BRANDING } from "../branding/branding";
import { saveWorkspace, loadWorkspace, CURRENT_VERSION } from "./workspace";

describe("workspace round-trip", () => {
  it("serializes store + branding to bytes and restores them", () => {
    const store = new MemoryStore();
    store.add({
      id: "employee_master:2026-03-06",
      kind: "employee_master",
      asOf: "2026-03-06",
      periodLabel: "2026-03-06",
      sourceFile: "emp.xlsx",
      compatibility: "full",
      rows: [{ employee_number: "AA1", full_name: "A B", department: "Tech" }],
    });
    const brand = { ...DEFAULT_BRANDING, appName: "Acme HR", primary: "#111111" };

    const bytes = saveWorkspace(store, brand);
    expect(bytes.byteLength).toBeGreaterThan(0);

    const restored = loadWorkspace(bytes);
    expect(restored.branding.appName).toBe("Acme HR");
    expect(restored.store.getLatest("employee_master")!.rows[0].employee_number).toBe("AA1");
  });

  it("round-trips saved views (and defaults to none for older files)", () => {
    const store = new MemoryStore();
    const views = [{ id: "v1", name: "Tech only", page: "People Analytics", filters: { department: ["Tech"] } }];
    const restored = loadWorkspace(saveWorkspace(store, DEFAULT_BRANDING, "now", views));
    expect(restored.savedViews).toHaveLength(1);
    expect(restored.savedViews[0].name).toBe("Tech only");
    expect(restored.savedViews[0].filters.department).toEqual(["Tech"]);
    // older workspace (no savedViews arg) -> empty list
    expect(loadWorkspace(saveWorkspace(store, DEFAULT_BRANDING)).savedViews).toEqual([]);
  });
});

// Build a raw gzipped workspace file at an arbitrary version, bypassing
// saveWorkspace (which always writes CURRENT_VERSION) — to exercise migration.
function rawWorkspace(obj: Record<string, unknown>): Uint8Array {
  return pako.gzip(JSON.stringify(obj));
}
const SNAP = {
  id: "employee_master:2026-03-06",
  kind: "employee_master",
  asOf: "2026-03-06",
  periodLabel: "2026-03-06",
  sourceFile: "emp.xlsx",
  compatibility: "full",
  rows: [{ employee_number: "AA1" }],
};

describe("workspace versioning & migration", () => {
  it("writes the current format version and round-trips the audit log", () => {
    const store = new MemoryStore();
    const audit = [{ ts: "2026-06-02T00:00:00Z", action: "Saved workspace", detail: "1 employee" }];
    const restored = loadWorkspace(saveWorkspace(store, DEFAULT_BRANDING, "now", [], audit));
    expect(restored.auditLog).toHaveLength(1);
    expect(restored.auditLog[0].action).toBe("Saved workspace");
  });

  it("round-trips scorecard targets and defaults them to {} when absent", () => {
    const store = new MemoryStore();
    const restored = loadWorkspace(saveWorkspace(store, DEFAULT_BRANDING, "now", [], [], { offer_accept: 90, pay_gap: 3 }));
    expect(restored.targets).toEqual({ offer_accept: 90, pay_gap: 3 });
    expect(loadWorkspace(saveWorkspace(store, DEFAULT_BRANDING)).targets).toEqual({});
  });

  it("round-trips edited benchmark bands and defaults them to {} when absent", () => {
    const store = new MemoryStore();
    const restored = loadWorkspace(saveWorkspace(store, DEFAULT_BRANDING, "now", [], [], {}, { pay_gap: { low: 0, high: 5 } }));
    expect(restored.benchmarks).toEqual({ pay_gap: { low: 0, high: 5 } });
    expect(loadWorkspace(saveWorkspace(store, DEFAULT_BRANDING)).benchmarks).toEqual({});
  });

  it("round-trips tracked actions and defaults them to [] when absent", () => {
    const store = new MemoryStore();
    const actions = [{ id: "a1", title: "Fix statutory", owner: "Payroll", status: "open" as const, due: null, note: "", source: "brain" as const, findingId: "statutory", createdAt: "2026-06-01T00:00:00Z", doneAt: null }];
    const restored = loadWorkspace(saveWorkspace(store, DEFAULT_BRANDING, "now", [], [], {}, {}, actions));
    expect(restored.actions).toHaveLength(1);
    expect(restored.actions[0].findingId).toBe("statutory");
    expect(loadWorkspace(saveWorkspace(store, DEFAULT_BRANDING)).actions).toEqual([]);
  });

  it("round-trips the benchmark pack id + custom pack, defaulting to general/null when absent", () => {
    const store = new MemoryStore();
    const custom = { id: "custom", name: "Our 2025 survey", source: "AON 2025", year: 2025, illustrative: false, bands: { pay_gap: { low: 0, high: 3 } } };
    const restored = loadWorkspace(saveWorkspace(store, DEFAULT_BRANDING, "now", [], [], {}, {}, [], "custom", custom));
    expect(restored.benchmarkPackId).toBe("custom");
    expect(restored.customBenchmarkPack?.name).toBe("Our 2025 survey");
    expect(restored.customBenchmarkPack?.bands.pay_gap).toEqual({ low: 0, high: 3 });
    const bare = loadWorkspace(saveWorkspace(store, DEFAULT_BRANDING));
    expect(bare.benchmarkPackId).toBe("general");
    expect(bare.customBenchmarkPack).toBeNull();
  });

  it("migrates a v1 file (no audit log) forward, defaulting auditLog to []", () => {
    const v1 = rawWorkspace({
      format: "hr-analytics-workspace",
      version: 1,
      generatedAt: "old",
      branding: { ...DEFAULT_BRANDING, appName: "Legacy Co" },
      snapshots: [SNAP],
      savedViews: [{ id: "v1", name: "All", page: "People Analytics", filters: {} }],
    });
    const restored = loadWorkspace(v1);
    expect(restored.branding.appName).toBe("Legacy Co");
    expect(restored.store.getLatest("employee_master")!.rows[0].employee_number).toBe("AA1");
    expect(restored.savedViews).toHaveLength(1);
    expect(restored.auditLog).toEqual([]);
  });

  it("treats a file with no version field as v1 and migrates it", () => {
    const noVersion = rawWorkspace({ format: "hr-analytics-workspace", generatedAt: "old", branding: DEFAULT_BRANDING, snapshots: [SNAP] });
    expect(loadWorkspace(noVersion).auditLog).toEqual([]);
  });

  it("refuses a file saved by a newer app version", () => {
    const future = rawWorkspace({ format: "hr-analytics-workspace", version: CURRENT_VERSION + 1, branding: DEFAULT_BRANDING, snapshots: [] });
    let msg = "";
    try {
      loadWorkspace(future);
    } catch (e) {
      msg = String((e as Error).message);
    }
    expect(/newer version/i.test(msg)).toBe(true);
  });

  it("rejects a file that is not a workspace", () => {
    let msg = "";
    try {
      loadWorkspace(rawWorkspace({ hello: "world" }));
    } catch (e) {
      msg = String((e as Error).message);
    }
    expect(/valid HR Analytics workspace/i.test(msg)).toBe(true);
  });
});
