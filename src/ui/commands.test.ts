import { describe, it, expect } from "vitest";
import { rankCommands, type Command } from "./commands";

const noop = () => {};
const cmds: Command[] = [
  { id: "go:people", title: "Go to People Analytics", hint: "Navigate", keywords: "open page", run: noop },
  { id: "go:branding", title: "Go to Branding", hint: "Navigate", keywords: "open page colours logo", run: noop },
  { id: "theme", title: "Switch to dark theme", hint: "Theme", keywords: "dark light mode toggle", run: noop },
  { id: "save", title: "Save workspace", hint: "Workspace", keywords: "download export backup", run: noop },
];

describe("rankCommands", () => {
  it("returns the list unchanged for an empty query", () => {
    expect(rankCommands(cmds, "").map((c) => c.id)).toEqual(["go:people", "go:branding", "theme", "save"]);
    expect(rankCommands(cmds, "   ").length).toBe(4);
  });

  it("filters to commands matching the query", () => {
    expect(rankCommands(cmds, "branding").map((c) => c.id)).toEqual(["go:branding"]);
    expect(rankCommands(cmds, "zzz")).toEqual([]);
  });

  it("matches via keywords, not just the title", () => {
    // "dark" only appears in the theme command's keywords
    expect(rankCommands(cmds, "dark").map((c) => c.id)).toEqual(["theme"]);
    // "logo" only in branding keywords
    expect(rankCommands(cmds, "logo").map((c) => c.id)).toEqual(["go:branding"]);
  });

  it("ranks title hits above keyword-only hits", () => {
    // "save" is a title word for one command and absent elsewhere
    const r = rankCommands(cmds, "save");
    expect(r[0].id).toBe("save");
  });

  it("requires all space-separated terms to match (AND)", () => {
    expect(rankCommands(cmds, "go branding").map((c) => c.id)).toEqual(["go:branding"]);
    expect(rankCommands(cmds, "go missing")).toEqual([]);
  });
});
