import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../state";
import { rankCommands, type Command } from "../commands";
import { useFocusTrap } from "../useFocusTrap";

const PAGES = ["People Analytics", "Directory", "Function Analytics", "Scenario", "Newsletter", "Data Intake", "Branding"];

// Global command palette (⌘/Ctrl-K). Owns its open state; other components can
// open it by dispatching a "cmdk:open" window event (see the sidebar button).
export function CommandPalette({ onSaveWorkspace }: { onSaveWorkspace: () => void }) {
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("cmdk:open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cmdk:open", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = PAGES.map((p) => ({
      id: `go:${p}`,
      title: `Go to ${p}`,
      hint: "Navigate",
      keywords: `open page view ${p}`,
      run: () => app.setPage(p),
    }));
    const dark = app.branding.theme === "dark";
    list.push({
      id: "theme",
      title: dark ? "Switch to light theme" : "Switch to dark theme",
      hint: "Theme",
      keywords: "dark light mode toggle appearance colour",
      run: () => app.setBranding({ ...app.branding, theme: dark ? "light" : "dark" }),
    });
    list.push({ id: "save", title: "Save workspace", hint: "Workspace", keywords: "download export gz backup", run: onSaveWorkspace });
    list.push({ id: "reset", title: "Reset People filters", hint: "Filters", keywords: "clear remove all", run: () => app.setPeopleFilters({}) });
    list.push({ id: "guide", title: "Open user guide", hint: "Help", keywords: "help guide manual docs documentation how to question mark", run: () => app.setPage("Guide") });
    for (const v of app.savedViews) {
      list.push({ id: `view:${v.id}`, title: `Apply view: ${v.name}`, hint: "Saved view", keywords: "filter preset", run: () => app.applyView(v.id) });
    }
    return list;
  }, [app, onSaveWorkspace]);

  const results = useMemo(() => rankCommands(commands, q), [commands, q]);
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, results.length - 1)));
  }, [results.length]);

  if (!open) return null;

  const run = (c?: Command) => {
    if (!c) return;
    c.run();
    setOpen(false);
  };
  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(results[active]);
    }
  };

  return (
    <div className="cmdk-overlay no-print" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="cmdk" ref={dialogRef} role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          className="cmdk-input"
          type="text"
          placeholder="Type a command — pages, theme, save, views…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={onInputKey}
        />
        <div className="cmdk-list">
          {results.length === 0 ? (
            <div className="cmdk-empty">No commands match “{q}”.</div>
          ) : (
            results.map((c, i) => (
              <button
                key={c.id}
                className={i === active ? "cmdk-item active" : "cmdk-item"}
                onMouseEnter={() => setActive(i)}
                onClick={() => run(c)}
              >
                <span className="cmdk-title">{c.title}</span>
                {c.hint ? <span className="cmdk-hint">{c.hint}</span> : null}
              </button>
            ))
          )}
        </div>
        <div className="cmdk-foot">
          <kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>↵</kbd> run · <kbd>Esc</kbd> close
        </div>
      </div>
    </div>
  );
}
