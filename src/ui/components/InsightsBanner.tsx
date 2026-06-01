import { useState } from "react";
import type { MetricWatchout } from "../../core/metrics/base";

// Cross-tab "needs attention" summary shown atop People Analytics. Surfaces the
// highest-severity watch-outs rolled up from every section so a serious issue
// in an unopened tab is still visible. Dismissible for the session.
export function InsightsBanner({ items, total }: { items: MetricWatchout[]; total: number }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || items.length === 0) return null;
  const high = items.filter((w) => w.severity === "high").length;
  return (
    <div className="insights no-print">
      <div className="insights-head">
        <span className="insights-title">
          Needs attention
          <span className="insights-count">
            {total} flagged{high ? ` · ${high} high` : ""}
          </span>
        </span>
        <button className="insights-dismiss" title="Dismiss" aria-label="Dismiss" onClick={() => setDismissed(true)}>
          ✕
        </button>
      </div>
      <div className="insights-items">
        {items.map((w, i) => (
          <div className={`insight sev-${w.severity}`} key={i}>
            <span className={`badge sev-${w.severity}`}>{w.severity}</span>
            <div className="insight-body">
              <strong>{w.title}</strong>
              <div className="insight-detail">{w.actionHint ?? w.detail}</div>
            </div>
            {w.owner ? <span className="insight-owner">{w.owner}</span> : null}
          </div>
        ))}
      </div>
      {total > items.length ? (
        <div className="insights-foot">+{total - items.length} more across the tabs below.</div>
      ) : null}
    </div>
  );
}
