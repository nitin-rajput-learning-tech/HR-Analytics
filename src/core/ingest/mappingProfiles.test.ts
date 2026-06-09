import { describe, it, expect } from "vitest";
import { profileApplies, resolveProfileForFile, type MappingProfile } from "./mappingProfiles";

describe("profileApplies", () => {
  it("matches when every profile header is present in the file (normalised: separator/whitespace/case)", () => {
    expect(profileApplies(["Emp Code", "Join Dt"], ["emp_code", "join-dt", "extra"])).toBe(true); // separator/case drift OK; extra column fine
    expect(profileApplies(["Emp Code", "Join Dt"], ["Emp Code"])).toBe(false); // a profile header missing
    expect(profileApplies([], ["Emp Code"])).toBe(false); // empty profile never applies
  });
});

describe("resolveProfileForFile", () => {
  it("re-keys the saved mapping onto the file's verbatim headers, tolerating drift", () => {
    const profile: MappingProfile = {
      kind: "employee_master",
      headers: ["Emp Code", "Join Dt"],
      mapping: { "Emp Code": "employee_number", "Join Dt": "date_joined" },
      savedAt: "2026-05-01T00:00:00.000Z",
    };
    // The new file spells the headers differently (underscore / extra spacing) — still resolves.
    const resolved = resolveProfileForFile(profile, ["emp_code", "Join  Dt", "Unknown"]);
    expect(resolved["emp_code"]).toBe("employee_number");
    expect(resolved["Join  Dt"]).toBe("date_joined");
    expect("Unknown" in resolved).toBe(false); // not in the profile → left alone
  });
});
