import { useState } from "react";
import { P2P_STATUSES, rejectP2pPayment } from "../../../api/paymentsApi";

function StatusBadge({ status }) {
  const map = {
    [P2P_STATUSES.AWAITING_CLINIC_PAYMENT]: ["status-pending", "Awaiting"],
    [P2P_STATUSES.AWAITING_ADMIN_CONFIRMATION]: ["status-processing", "Submitted"],
    [P2P_STATUSES.PAID]: ["status-paid", "Paid"],
    [P2P_STATUSES.REJECTED]: ["status-failed", "Disputed"]
  };
  const [cls, label] = map[status] || ["status-pending", status || "-"];
  return <span className={`status-pill ${cls}`}>{label}</span>;
}

function P2pConfirmationsTable({ items = [], onRefresh, currentAdminEmail }) {
  const [busyId, setBusyId] = useState("");
  const [rejectingId, setRejectingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const handleStartReject = (item) => {
    setRejectingId(item.paymentId);
    setRejectReason("");
  };

  const handleConfirmReject = async (item) => {
    setBusyId(item.paymentId);
    try {
      await rejectP2pPayment({
        paymentId: item.paymentId,
        caseId: item.caseId,
        reason: rejectReason.trim() || "Flagged as disputed by admin",
        rejectedBy: currentAdminEmail || null
      });
      setRejectingId("");
      setRejectReason("");
      if (typeof onRefresh === "function") await onRefresh();
    } finally {
      setBusyId("");
    }
  };

  if (!items.length) {
    return (
      <section className="card">
        <h3>P2P Payments (Recent)</h3>
        <p className="auth-meta">No direct PayPal payments recorded yet.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h3>P2P Payments (Recent)</h3>
      <p className="auth-meta">
        Clinic-submitted payments are auto-marked as paid for the pilot. Use Dispute to roll back
        a payment if the proof turns out to be invalid; the report will be re-locked.
      </p>
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>Case ID</th>
            <th>Reviewer PayPal</th>
            <th>Tx ID</th>
            <th>Amount</th>
            <th>Proof</th>
            <th>Submitted</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.paymentId}>
              <td><StatusBadge status={item.status} /></td>
              <td><code>{item.caseId}</code></td>
              <td>{item.paypalRecipientEmail || "-"}</td>
              <td>{item.transactionReference || "-"}</td>
              <td>
                {item.amount} {item.currency || "USD"}
              </td>
              <td>
                {item.proofUrl ? (
                  <a href={item.proofUrl} target="_blank" rel="noreferrer">
                    view
                  </a>
                ) : (
                  "-"
                )}
              </td>
              <td>{item.updatedAt || item.createdAt || "-"}</td>
              <td>
                {item.status === P2P_STATUSES.PAID && rejectingId === item.paymentId && (
                  <div className="row">
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="Dispute reason"
                      style={{ minWidth: 160 }}
                    />
                    <button
                      className="btn small"
                      type="button"
                      disabled={busyId === item.paymentId}
                      onClick={() => handleConfirmReject(item)}
                    >
                      {busyId === item.paymentId ? "..." : "Confirm Dispute"}
                    </button>
                    <button className="btn small" type="button" onClick={() => setRejectingId("")}>
                      Cancel
                    </button>
                  </div>
                )}
                {item.status === P2P_STATUSES.PAID && rejectingId !== item.paymentId && (
                  <button
                    className="btn small"
                    type="button"
                    onClick={() => handleStartReject(item)}
                  >
                    Dispute
                  </button>
                )}
                {item.status === P2P_STATUSES.REJECTED && (
                  <span className="auth-meta">
                    {item.rejectionReason ? `Reason: ${item.rejectionReason}` : "Disputed"}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default P2pConfirmationsTable;
