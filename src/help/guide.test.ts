import { describe, it, expect } from "vitest";
import { GUIDEBOOK_HTML } from "./guidebookHtml";
import { scrollGuideAnchor } from "./guideAnchors";

// Browser-targeted tsconfig (no @types/node), but the runner bundles to CJS on
// platform:node — declare require/process locally to read source files.
declare const require: (m: string) => any;
declare const process: { cwd(): string };
const fs = require("node:fs");
const path = require("node:path");

describe("in-app user guide", () => {
  it("embeds a self-contained, branded, print-ready guidebook", () => {
    expect(GUIDEBOOK_HTML.length).toBeGreaterThan(5000);
    expect(GUIDEBOOK_HTML.toLowerCase()).toContain("<!doctype html>");
    expect(GUIDEBOOK_HTML).toContain("HR Analytics"); // product name
    expect(GUIDEBOOK_HTML).toContain("User Guide"); // it is a guide
    expect(GUIDEBOOK_HTML).toContain("@media print"); // print-optimised
    expect(GUIDEBOOK_HTML).toContain("print-color-adjust"); // colours survive PDF
    expect(GUIDEBOOK_HTML.includes('src="img/')).toBe(false); // self-contained — no external images
  });

  it("has a table of contents whose anchor links all resolve to section ids", () => {
    const hrefs = [...GUIDEBOOK_HTML.matchAll(/href="#(sec-[a-z-]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThanOrEqual(10);
    for (const id of hrefs) {
      expect(GUIDEBOOK_HTML.includes(`id="${id}"`)).toBe(true);
    }
  });

  it("scrolls the matching element into view within the frame (no srcdoc reload)", () => {
    let scrolled: string | null = null;
    const doc = {
      getElementById: (id: string) =>
        id === "sec-overview" ? { scrollIntoView: () => { scrolled = id; } } : null,
    };
    // A real TOC target → handled (preventDefault) and scrolled.
    expect(scrollGuideAnchor("#sec-overview", doc)).toBe(true);
    expect(scrolled).toBe("sec-overview");
    // An unknown anchor → still handled, so the srcdoc frame does not reload.
    expect(scrollGuideAnchor("#does-not-exist", doc)).toBe(true);
    // A non-anchor / external link → not our concern.
    expect(scrollGuideAnchor("https://example.com", doc)).toBe(false);
    expect(scrollGuideAnchor("", doc)).toBe(false);
    expect(scrollGuideAnchor(null, doc)).toBe(false);
  });

  it("is reachable — imported, registered as a page, and rendered in AppShell", () => {
    const shell = fs.readFileSync(path.resolve(process.cwd(), "src/ui/AppShell.tsx"), "utf8");
    expect(shell.includes("./pages/Guide")).toBe(true); // imported
    expect(shell.includes('"Guide"')).toBe(true); // in the PAGES nav array
    expect(shell.includes('page === "Guide"')).toBe(true); // rendered in the shell
  });
});
