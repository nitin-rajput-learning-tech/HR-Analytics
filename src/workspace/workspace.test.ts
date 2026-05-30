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
});
