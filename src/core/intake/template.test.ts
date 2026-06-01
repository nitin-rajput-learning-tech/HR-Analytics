import { describe, it, expect } from "vitest";
import { templateAoA } from "./template";
import { ALL_SCHEMAS, getSchema } from "../datasets";

describe("templateAoA", () => {
  it("builds aligned Data, Dictionary and README sheets for a schema", () => {
    const schema = getSchema("ta_requisition");
    const t = templateAoA(schema);
    expect(t.data[0]).toContain("Requisition ID");
    expect(t.data).toHaveLength(2);
    expect(t.data[0].length).toBe(t.data[1].length);
    expect(t.dictionary[0]).toEqual(["Field", "Column header", "Required", "Type", "Allowed values", "Example", "Notes"]);
    expect(t.dictionary).toHaveLength(schema.fields.length + 1);
    expect(t.dictionary.some((r) => r[0] === "requisition_id" && r[2] === "Yes")).toBe(true);
    expect(t.dictionary.some((r) => r[0] === "status" && r[4].includes("Open"))).toBe(true);
    expect(t.readme.some((r) => r[0] === "Dataset")).toBe(true);
  });

  it("produces a valid template for every registered schema", () => {
    for (const s of ALL_SCHEMAS) {
      const t = templateAoA(s);
      expect(t.data[0].length).toBe(s.fields.length);
      expect(t.data[1].length).toBe(s.fields.length);
      expect(t.dictionary).toHaveLength(s.fields.length + 1);
      expect(t.readme.length).toBeGreaterThanOrEqual(8);
    }
  });
});
