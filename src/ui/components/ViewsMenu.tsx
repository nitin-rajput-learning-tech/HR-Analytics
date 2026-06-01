import { useState } from "react";
import { useApp } from "../state";
import { activeFilterCount } from "../../core/filters";

// Save the current page + People filters as a named view, and re-apply/delete
// saved views. Persisted with the workspace.
export function ViewsMenu() {
  const { savedViews, saveView, applyView, deleteView, peopleFilters } = useApp();
  const [name, setName] = useState("");
  const canSave = activeFilterCount(peopleFilters) > 0;

  return (
    <details className="views-menu no-print">
      <summary>
        Views
        {savedViews.length ? <span className="filter-badge">{savedViews.length}</span> : null}
      </summary>
      <div className="views-pop">
        {savedViews.length === 0 ? (
          <p className="muted" style={{ margin: "2px 4px 8px", fontSize: ".82rem" }}>No saved views yet.</p>
        ) : (
          savedViews.map((v) => (
            <div className="view-row" key={v.id}>
              <button className="view-apply" onClick={() => applyView(v.id)} title="Apply this view">
                {v.name}
              </button>
              <button className="view-del" title="Delete view" onClick={() => deleteView(v.id)}>
                ✕
              </button>
            </div>
          ))
        )}
        <div className="view-save">
          <input
            type="text"
            placeholder="Name this view…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                saveView(name.trim());
                setName("");
              }
            }}
          />
          <button
            disabled={!name.trim() || !canSave}
            title={canSave ? "Save the current filters as a view" : "Apply a filter or search first"}
            onClick={() => {
              if (name.trim()) {
                saveView(name.trim());
                setName("");
              }
            }}
          >
            Save current
          </button>
        </div>
      </div>
    </details>
  );
}
