import { useEffect, useMemo, useState } from "react";
import { getUserProfileById } from "../../../api/platformApi";
import {
  P2P_METHOD,
  P2P_STATUSES,
  PAYPAL_SEND_MONEY_URL,
  getDefaultCasePriceUsd,
  getPaymentForCase,
  isP2pEnabled,
  isPaymentPaid,
  isValidPaypalTransactionId,
  submitP2pPayment
} from "../../../api/paymentsApi";

function StatusLine({ status, rejectionReason }) {
  if (!status) return <span className="status-pill status-pending">No payment yet</span>;
  const map = {
    [P2P_STATUSES.AWAITING_CLINIC_PAYMENT]: ["status-pending", "Awaiting clinic payment"],
    [P2P_STATUSES.AWAITING_ADMIN_CONFIRMATION]: ["status-processing", "Submitted"],
    [P2P_STATUSES.PAID]: ["status-paid", "Paid"],
    [P2P_STATUSES.REJECTED]: ["status-failed", "Rejected"]
  };
  const [cls, label] = map[status] || ["status-pending", status];
  return (
    <span className={`status-pill ${cls}`}>
      {label}
      {status === P2P_STATUSES.REJECTED && rejectionReason ? ` - ${rejectionReason}` : ""}
    </span>
  );
}

function CopyButton({ value, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch (_error) {
      const textarea = document.createElement("textarea");
      textarea.value = String(value);
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };
  return (
    <button className="btn small" type="button" onClick={handleCopy} disabled={!value}>
      {copied ? "Copied" : label}
    </button>
  );
}

function P2pPaymentPanel({ caseItem, role, onPaymentChanged }) {
  const [reviewerProfile, setReviewerProfile] = useState(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [proofFile, setProofFile] = useState(null);

  const reviewerId = caseItem?.reviewerId || null;
  const caseId = caseItem?.id;
  const amountUsd = useMemo(() => getDefaultCasePriceUsd(), []);
  // Treat anyone who is not explicitly a reviewer/admin as a clinic actor.
  // This keeps the payment flow visible even when a profile.role value has
  // not been persisted yet (e.g. legacy account or skipped role selection).
  const isClinic = role !== "reviewer" && role !== "admin";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [profile, latestPayment] = await Promise.all([
          reviewerId ? getUserProfileById(reviewerId) : Promise.resolve(null),
          caseId ? getPaymentForCase(caseId) : Promise.resolve(null)
        ]);
        if (cancelled) return;
        setReviewerProfile(profile);
        setPayment(latestPayment);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [reviewerId, caseId]);

  const refreshPayment = async () => {
    const latestPayment = await getPaymentForCase(caseId);
    setPayment(latestPayment);
    if (typeof onPaymentChanged === "function") onPaymentChanged(latestPayment);
  };

  const handleSubmit = async () => {
    const trimmedTx = transactionRef.trim().toUpperCase();
    if (!isValidPaypalTransactionId(trimmedTx)) {
      setMessage("PayPal Transaction ID must be exactly 17 characters (A-Z, 0-9).");
      return;
    }
    if (!proofFile) {
      setMessage("Please attach a screenshot of the PayPal receipt.");
      return;
    }
    if (!reviewerProfile?.paypal_email && !payment?.paypalRecipientEmail) {
      setMessage("Reviewer's PayPal email is missing. Please contact the admin.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await submitP2pPayment({
        caseId,
        paypalRecipientEmail: reviewerProfile?.paypal_email || payment?.paypalRecipientEmail,
        amount: amountUsd,
        transactionReference: trimmedTx,
        proofFile
      });
      setTransactionRef("");
      setProofFile(null);
      await refreshPayment();
      setMessage("Payment recorded. The report has been unlocked.");
    } catch (error) {
      setMessage(error?.message || "Failed to submit confirmation.");
    } finally {
      setBusy(false);
    }
  };

  if (!isP2pEnabled()) return null;

  if (loading) {
    return (
      <section className="card" id="payment">
        <h3>Direct PayPal Settlement</h3>
        <p className="auth-meta">Loading payment status...</p>
      </section>
    );
  }

  const status = payment?.method === P2P_METHOD ? payment?.status : null;
  const paid = isPaymentPaid(payment);
  const reviewerEmail = reviewerProfile?.paypal_email || payment?.paypalRecipientEmail;
  const reviewerLoginEmail = reviewerProfile?.email || null;
  const reviewerName = reviewerProfile?.full_name || null;
  const reviewerFallbackId =
    !reviewerName && !reviewerLoginEmail ? reviewerId : null;
  const paypalDiffersFromLogin =
    reviewerEmail && reviewerLoginEmail && reviewerEmail !== reviewerLoginEmail;
  const noReviewer = !reviewerId;
  const noReviewerPaypal = reviewerId && !reviewerEmail;

  const trimmedTx = transactionRef.trim().toUpperCase();
  const txValid = isValidPaypalTransactionId(trimmedTx);
  const canSubmit = isClinic && reviewerEmail && txValid && proofFile && !busy;

  // Hide form for already-confirmed states
  const alreadySubmitted =
    status === P2P_STATUSES.AWAITING_ADMIN_CONFIRMATION || status === P2P_STATUSES.PAID;

  return (
    <section className="card" id="payment">
      <h3>Direct PayPal Settlement (Pilot)</h3>
      <p>
        For pilot cases, the clinic pays the reviewer directly via PayPal. Send the funds to the
        reviewer's PayPal address, attach the PayPal transaction ID and a receipt screenshot, and
        the report will be unlocked immediately. (The admin retains the right to flag a payment
        as disputed if the proof is later found invalid.)
      </p>

      <div className="grid two">
        <div>
          <small>Reviewer</small>
          {noReviewer ? (
            <p>Not assigned yet</p>
          ) : (
            <p style={{ lineHeight: 1.5 }}>
              {reviewerName && <strong>{reviewerName}</strong>}
              {reviewerName && reviewerLoginEmail && <br />}
              {reviewerLoginEmail && (
                <span className="auth-meta">Login: {reviewerLoginEmail}</span>
              )}
              {reviewerFallbackId && <span className="auth-meta">{reviewerFallbackId}</span>}
              {reviewerEmail && (
                <>
                  <br />
                  <span className="auth-meta">
                    PayPal: <code>{reviewerEmail}</code>
                    {paypalDiffersFromLogin ? " (differs from login)" : ""}
                  </span>
                </>
              )}
            </p>
          )}
        </div>
        <div>
          <small>Status</small>
          <p>
            <StatusLine status={status} rejectionReason={payment?.rejectionReason} />
          </p>
        </div>
      </div>

      {isClinic && noReviewer && (
        <div className="warning-box">
          A reviewer has not been assigned to this case yet. Please wait for the admin to assign
          one before initiating payment.
        </div>
      )}

      {isClinic && !noReviewer && noReviewerPaypal && (
        <div className="warning-box">
          The assigned reviewer has not registered a PayPal email yet. Please contact the admin.
        </div>
      )}

      {isClinic && reviewerEmail && !alreadySubmitted && (
        <>
          <div className="card" style={{ marginTop: 12 }}>
            <strong>Step 1. Send the payment via PayPal</strong>
            <div className="form-grid auth-grid">
              <div className="full">
                <small>Reviewer's PayPal email</small>
                <div className="row">
                  <input type="text" value={reviewerEmail} readOnly />
                  <CopyButton value={reviewerEmail} label="Copy email" />
                </div>
              </div>
              <div className="full">
                <small>Amount (USD)</small>
                <div className="row">
                  <input type="text" value={amountUsd.toFixed(2)} readOnly />
                  <CopyButton value={amountUsd.toFixed(2)} label="Copy amount" />
                </div>
              </div>
              <div className="row full">
                <a
                  className="btn primary"
                  href={PAYPAL_SEND_MONEY_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open PayPal Send Money
                </a>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <strong>Step 2. Submit proof</strong>
            <div className="form-grid auth-grid">
              <div className="full">
                <label>PayPal Transaction ID (17 characters, A-Z and 0-9)</label>
                <input
                  type="text"
                  value={transactionRef}
                  onChange={(event) => setTransactionRef(event.target.value)}
                  placeholder="e.g. 8AB12345CD6789012"
                  maxLength={17}
                  spellCheck={false}
                  style={{ textTransform: "uppercase", fontFamily: "monospace" }}
                />
                {transactionRef.length > 0 && !txValid && (
                  <small style={{ color: "#8b1f15" }}>
                    Must be exactly 17 characters (A-Z, 0-9). Currently {trimmedTx.length}/17.
                  </small>
                )}
              </div>
              <div className="full">
                <label>Receipt screenshot (image or PDF)</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(event) => setProofFile(event.target.files?.[0] || null)}
                />
                {proofFile && <small>{proofFile.name}</small>}
              </div>
              <div className="row full">
                <button
                  className="btn primary"
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                >
                  {busy ? "Submitting..." : "Submit Confirmation"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {alreadySubmitted && (
        <div className="card" style={{ marginTop: 12 }}>
          {payment?.transactionReference && (
            <p className="auth-meta">PayPal Tx ID: <code>{payment.transactionReference}</code></p>
          )}
          {payment?.proofUrl && (
            <p className="auth-meta">
              Proof: <a href={payment.proofUrl} target="_blank" rel="noreferrer">view screenshot</a>
            </p>
          )}
          {paid ? (
            <p>Payment recorded. The report is now unlocked.</p>
          ) : status === P2P_STATUSES.REJECTED ? (
            <p>
              This payment was flagged as disputed by the admin
              {payment?.rejectionReason ? `: ${payment.rejectionReason}` : ""}. Please contact
              the admin or resubmit a corrected proof.
            </p>
          ) : (
            <p>Confirmation received. Awaiting verification.</p>
          )}
        </div>
      )}

      {message && <p className="auth-meta">{message}</p>}
    </section>
  );
}

export default P2pPaymentPanel;
