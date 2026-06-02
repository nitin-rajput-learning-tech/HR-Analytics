import { describe, it, expect } from "vitest";
import { formatBytes } from "./storage";

describe("formatBytes", () => {
  it("formats bytes, KB, MB and GB with sensible precision", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(6293)).toBe("6.1 KB");
    expect(formatBytes(23 * 1024)).toBe("23 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatBytes(40 * 1024 * 1024)).toBe("40 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });
  it("returns a dash for missing or invalid sizes", () => {
    expect(formatBytes(null)).toBe("—");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatBytes(-5)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("—");
  });
});
