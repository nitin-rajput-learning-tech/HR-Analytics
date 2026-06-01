import { describe, it, expect } from "vitest";
import { MemoryStore } from "../core/store/memoryStore";
import { DEFAULT_BRANDING } from "../branding/branding";
import { saveWorkspace, loadWorkspace } from "./workspace";

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
