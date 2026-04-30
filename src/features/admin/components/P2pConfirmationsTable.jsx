import { useState } from "react";
import { approveP2pPayment, rejectP2pPayment } from "../../../api/paymentsApi";

function P2pConfirmationsTable({ items = [], onRefresh, currentAdminEmail }) {
  const [busyId, setBusyId] = useState("");
  const [rejectingId, setRejectingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const handleApprove = async (item) => {
    setBusyId(item.paymentId);
    try {
      await approveP2pPayment({
        paymentId: item.paymentId,
        caseId: item.caseId,
        approvedBy: currentAdminEmail || null
      });
      if (typeof onRefresh === "function") await onRefresh();
    } finally {
      setBusyId("");
    }
  };

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
        reason: rejectReason.trim() || "Rejected by admin",
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
        <h3>Pending P2P Confirmations</h3>
        <p className="auth-meta">No pending direct PayPal payments to verify.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h3>Pending P2P Confirmations</h3>
      <table>
        <thead>
          <tr>
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
              <td>
                <code>{item.caseId}</code>
              </td>
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
                {rejectingId === item.paymentId ? (
                  <div className="row">
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="Reason"
                      style={{ minWidth: 160 }}
                    />
                    <button
                      className="btn small"
                      type="button"
                      disabled={busyId === item.paymentId}
                      onClick={() => handleConfirmReject(item)}
                    >
                      {busyId === item.paymentId ? "..." : "Confirm Reject"}
                    </button>
                    <button className="btn small" type="button" onClick={() => setRejectingId("")}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="row">
                    <button
                      className="btn small primary"
                      type="button"
                      disabled={busyId === item.paymentId}
                      onClick={() => handleApprove(item)}
                    >
                      {busyId === item.paymentId ? "..." : "Approve & Unlock"}
                    </button>
                    <button
                      className="btn small"
                      type="button"
                      onClick={() => handleStartReject(item)}
                    >
                      Reject
                    </button>
                  </div>
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
