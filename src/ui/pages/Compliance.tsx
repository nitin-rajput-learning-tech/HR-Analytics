import { useMemo } from "react";
import { useApp } from "../state";
import * as N from "../../core/narrative";
import { combinedEmployeeSnapshot } from "../../core/metrics/combineEmployees";
import { buildComplianceCalendar, type ComplianceItem, type ComplianceStatus } from "../../core/metrics/compliance";

const STATUS_LABEL: Record<ComplianceStatus, string> = { overdue: "Overdue", due_soon: "Due soon", upcoming: "Upcoming", done: "Settled" };

function whenLabel(d: number | null): string {
  if (d === null) return "—";
  if (d < 0) return `${-d}d overdue`;
  if (d === 0) return "today";
  return `in ${d}d`;
}

export function Compliance() {
  const { store, version } = useApp();
  const snap = useMemo(() => combinedEmployeeSnapshot(store), [store, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const statutoryRows = useMemo(() => store.getLatest("payroll_statutory")?.rows ?? null, [store, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const contractRows = useMemo(() => store.getLatest("admin_contract")?.rows ?? null, [store, version]);
  const asOf = snap?.asOf ?? store.getLatest("payroll_statutory")?.asOf ?? store.getLatest("admin_contract")?.asOf ?? null;
  const cal = useMemo(() => buildComplianceCalendar({ statutoryRows, contractRows, asOf }), [statutoryRows, contractRows, asOf]);

  const renderRow = (i: ComplianceItem) => (
    <tr key={i.id}>
      <td><span className={`cmp-badge ${i.status}`}>{STATUS_LABEL[i.status]}</span></td>
      <td>{i.title}</td>
      <td className="muted">{i.category}</td>
      <td>{i.dueDate}</td>
      <td className={i.status === "overdue" ? "cmp-when-over" : ""}>{whenLabel(i.daysUntil)}</td>
      <td className="muted">{i.owner}</td>
      <td>{i.amount === null ? "—" : N.humanizeMoneyInr(i.amount)}</td>
    </tr>
  );

  return (
    <div className="compliance">
      <div className="page-head">
        <h2>Compliance Calendar</h2>
        <p className="page-sub">
          Forward-looking statutory remittances and vendor/AMC renewals, dated and classified so nothing lapses. Relative to{" "}
          {asOf || "the latest period"}. On-device — no data leaves your machine.
        </p>
      </div>

      {!cal.hasData ? (
        <p className="muted placeholder">
          No statutory or contract data yet. Upload <strong>Payroll — Statutory Compliance</strong> and/or <strong>HR Admin — Contracts &amp; AMC</strong> on the Data Intake page to build the calendar.
        </p>
      ) : (
        <>
          <div className="sc-summary" role="status">
            <span className="sc-chip red"><span className="rag-dot red" aria-hidden="true" /> {cal.summary.overdue} overdue</span>
            <span className="sc-chip amber"><span className="rag-dot amber" aria-hidden="true" /> {cal.summary.dueSoon} due soon</span>
            <span className="sc-chip none"><span className="rag-dot none" aria-hidden="true" /> {cal.summary.upcoming} upcoming</span>
            <span className="sc-chip green"><span className="rag-dot green" aria-hidden="true" /> {cal.summary.done} settled</span>
          </div>

          {cal.items.length ? (
            <div className="metric-table">
              <div className="mt-head"><h3>Open obligations</h3></div>
              <div className="table-scroll" tabIndex={0} aria-label="Open compliance obligations">
                <table>
                  <thead>
                    <tr><th>Status</th><th>Item</th><th>Category</th><th>Due</th><th>When</th><th>Owner</th><th>Amount</th></tr>
                  </thead>
                  <tbody>{cal.items.map(renderRow)}</tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="cmp-clear">✅ Nothing open — all tracked statutory filings and renewals are settled.</p>
          )}

          {cal.done.length ? (
            <details className="cmp-done">
              <summary>{cal.done.length} settled (paid / auto-renew / cancelled)</summary>
              <div className="metric-table">
                <div className="table-scroll" tabIndex={0} aria-label="Settled compliance items">
                  <table>
                    <thead>
                      <tr><th>Status</th><th>Item</th><th>Category</th><th>Due</th><th>When</th><th>Owner</th><th>Amount</th></tr>
                    </thead>
                    <tbody>{cal.done.map(renderRow)}</tbody>
                  </table>
                </div>
              </div>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
