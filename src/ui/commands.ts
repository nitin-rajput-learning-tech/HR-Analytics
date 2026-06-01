// Pure command model + ranking for the command palette (⌘/Ctrl-K).
// Kept free of React/DOM so the matching logic is unit-testable in isolation;
// CommandPalette.tsx supplies the runnable commands and renders the results.

export interface Command {
  id: string;
  title: string;
  hint?: string; // short right-aligned category, e.g. "Navigate", "Theme"
  keywords?: string; // extra search terms not shown in the title
  run: () => void;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// All query terms (space-separated) must match somewhere in title+hint+keywords
// (AND semantics). Title matches outweigh keyword matches; a prefix or
// word-boundary hit in the title is boosted so the most direct command wins.
function scoreCommand(c: Command, terms: string[]): number {
  const title = c.title.toLowerCase();
  const hay = `${c.title} ${c.hint ?? ""} ${c.keywords ?? ""}`.toLowerCase();
  let score = 0;
  for (const t of terms) {
    if (!hay.includes(t)) return 0;
    score += title.includes(t) ? 2 : 1;
    if (title.startsWith(t)) score += 2;
    else if (new RegExp(`\\b${escapeRegex(t)}`).test(title)) score += 1;
  }
  return score;
}

// Filter + rank commands for a query. Empty query returns the list unchanged
// (preserving the caller's natural order). Stable for equal scores.
export function rankCommands(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  const terms = q.split(/\s+/);
  return commands
    .map((c, i) => ({ c, i, score: scoreCommand(c, terms) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.c);
}
