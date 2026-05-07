import { useState } from "react";
import { recheckPayout } from "../../../api/paymentsApi";

function formatAmount(value, currency = "USD") {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toFixed(2)} ${currency}`;
}

function StatusBadge({ status }) {
  const normalized = (status || "").toLowerCase();
  const className =
    normalized === "paid"
      ? "status-pill status-paid"
      : normalized === "pending"
      ? "status-pill status-pending"
      : normalized === "processing"
      ? "status-pill status-processing"
      : normalized === "failed"
      ? "status-pill status-failed"
      : "status-pill status-blocked";
  return <span className={className}>{status || "unknown"}</span>;
}

function PayoutsQueueTable({ items = [], onRefresh }) {
  const [busyId, setBusyId] = useState("");

  const handleRecheck = async (caseId) => {
    if (!caseId) return;
    setBusyId(caseId);
    try {
      await recheckPayout(caseId);
      if (typeof onRefresh === "function") await onRefresh();
    } finally {
      setBusyId("");
    }
  };

  if (!items.length) {
    return (
      <section className="card">
        <h3>Payouts Queue</h3>
        <p className="auth-meta">No payouts queued yet.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h3>Payouts Queue</h3>
      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Case ID</th>
            <th>Reviewer</th>
            <th>PayPal Email</th>
            <th>Gross</th>
            <th>Fee</th>
            <th>Net</th>
            <th>Status</th>
            <th>Notes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((payout) => (
            <tr key={payout.id || payout.caseId}>
              <td>{payout.caseId}</td>
              <td>{payout.reviewerEmail || payout.reviewerId || "-"}</td>
              <td>{payout.paypalEmail || <em>missing</em>}</td>
              <td>{formatAmount(payout.grossAmount, payout.currency)}</td>
              <td>{formatAmount(payout.platformFee, payout.currency)}</td>
              <td>{formatAmount(payout.netAmount, payout.currency)}</td>
              <td>
                <StatusBadge status={payout.status} />
              </td>
              <td>{payout.notes || "-"}</td>
              <td>
                <button
                  className="btn small"
                  type="button"
                  disabled={busyId === payout.caseId}
                  onClick={() => handleRecheck(payout.caseId)}
                >
                  {busyId === payout.caseId ? "Checking..." : "Recheck"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}

export default PayoutsQueueTable;
