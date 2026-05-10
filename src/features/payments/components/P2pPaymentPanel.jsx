import { useEffect, useMemo, useState } from "react";
import { getUserProfileById } from "../../../api/platformApi";
import {
  FIRST_FREE_METHOD,
  P2P_METHOD,
  P2P_STATUSES,
  PAYPAL_CHECKOUT_METHOD,
  createCheckoutSession,
  getDefaultCasePriceUsd,
  getPaymentForCase,
  hasPaymentsGateway,
  isP2pEnabled,
  isPaymentPaid
} from "../../../api/paymentsApi";

function PaymentStatusPill({ payment, paid, firstCaseFree }) {
  if (firstCaseFree) {
    return <span className="status-pill status-paid">First case free</span>;
  }
  if (paid) {
    return <span className="status-pill status-paid">Paid</span>;
  }
  const method = payment?.method;
  const status = payment?.status;
  if (method === PAYPAL_CHECKOUT_METHOD && String(status).toLowerCase() === "redirect_required") {
    return <span className="status-pill status-processing">PayPal checkout in progress</span>;
  }
  if (method === P2P_METHOD) {
    const map = {
      [P2P_STATUSES.AWAITING_CLINIC_PAYMENT]: ["status-pending", "Awaiting clinic payment"],
      [P2P_STATUSES.AWAITING_ADMIN_CONFIRMATION]: ["status-processing", "Submitted"],
      [P2P_STATUSES.PAID]: ["status-paid", "Paid"],
      [P2P_STATUSES.REJECTED]: ["status-failed", "Rejected"]
    };
    const [cls, label] = map[status] || ["status-pending", status || "—"];
    return (
      <span className={`status-pill ${cls}`}>
        {label}
        {status === P2P_STATUSES.REJECTED && payment?.rejectionReason
          ? ` - ${payment.rejectionReason}`
          : ""}
      </span>
    );
  }
  return <span className="status-pill status-pending">No payment yet</span>;
}

function P2pPaymentPanel({ caseItem, role, onPaymentChanged, refreshKey = 0 }) {
  const [reviewerProfile, setReviewerProfile] = useState(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const reviewerId = caseItem?.reviewerId || null;
  const caseId = caseItem?.id;
  const amountUsd = useMemo(() => getDefaultCasePriceUsd(), []);
  const gatewayOk = hasPaymentsGateway();

  const isClinic = role !== "reviewer" && role !== "admin";

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [profile, latestPayment] = await Promise.all([
          reviewerId ? getUserProfileById(reviewerId) : Promise.resolve(null),
          caseId ? getPaymentForCase(caseId).catch(() => null) : Promise.resolve(null)
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
    // refreshKey is bumped by the parent (e.g., after claiming the first
    // case free promo) so we re-read payment_transactions and avoid showing
    // a stale "Pay" CTA after the credit has been applied.
  }, [reviewerId, caseId, refreshKey]);

  const handlePayPalCheckout = async () => {
    if (!caseId) return;
    if (!gatewayOk) {
      setMessage("Payments API URL is not configured. Set VITE_PAYMENTS_API_BASE_URL on the frontend.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const session = await createCheckoutSession({
        method: "paypal",
        amount: amountUsd,
        currency: "USD",
        caseId
      });
      if (!session?.redirectUrl) {
        throw new Error("PayPal did not return a checkout link. Check server PayPal credentials.");
      }
      window.location.assign(session.redirectUrl);
    } catch (error) {
      setMessage(error?.message || "Could not start PayPal checkout.");
      setBusy(false);
    }
  };

  if (!isP2pEnabled()) return null;

  if (loading) {
    return (
      <section className="card" id="payment">
        <h3>PayPal Checkout</h3>
        <p className="auth-meta">Loading payment status...</p>
      </section>
    );
  }

  const paid = isPaymentPaid(payment);
  const firstCaseFreeApplied = payment?.method === FIRST_FREE_METHOD && paid;
  const checkoutStarted =
    payment?.method === PAYPAL_CHECKOUT_METHOD && String(payment?.status).toLowerCase() === "redirect_required";

  const reviewerLoginEmail = reviewerProfile?.email || null;
  const reviewerName = reviewerProfile?.full_name || null;
  const reviewerFallbackId =
    !reviewerName && !reviewerLoginEmail ? reviewerId : null;
  const noReviewer = !reviewerId;

  const needsPayment = isClinic && !paid && !firstCaseFreeApplied;
  const canPay = needsPayment && gatewayOk && caseItem?.status === "Report Ready";

  return (
    <section className="card" id="payment">
      <h3>PayPal Checkout</h3>
      {firstCaseFreeApplied && (
        <div className="warning-box" style={{ marginBottom: 12 }}>
          First case free credit applied for this clinic. No payment is required for this case.
        </div>
      )}
      <p>
        Pay securely with PayPal. After payment completes, your case report unlocks automatically—no transaction ID or
        receipt upload is required.
      </p>
      <p className="auth-meta">
        Settlement is processed to the VetBridge business account (vetbridgesupport@gmail.com). Reviewer payouts are
        handled separately per pilot terms (approx. fee split is configured for settlement math).
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
            </p>
          )}
        </div>
        <div>
          <small>Status</small>
          <p>
            <PaymentStatusPill payment={payment} paid={paid} firstCaseFree={firstCaseFreeApplied} />
          </p>
        </div>
      </div>

      {isClinic && caseItem?.status !== "Report Ready" && !firstCaseFreeApplied && (
        <div className="warning-box">
          Payment opens when the report is ready (&quot;Report Ready&quot;).
        </div>
      )}

      {isClinic && !gatewayOk && needsPayment && (
        <div className="warning-box">
          <strong>Configuration needed:</strong> set <code>VITE_PAYMENTS_API_BASE_URL</code> (e.g.{" "}
          <code>/api/payments</code> on Vercel) and server env <code>PAYPAL_CLIENT_ID</code> /{" "}
          <code>PAYPAL_CLIENT_SECRET</code> (vetbridgesupport business account).
        </div>
      )}

      {canPay && (
        <div className="card" style={{ marginTop: 12 }}>
          <strong>Amount: ${amountUsd.toFixed(2)} USD</strong>
          <p className="auth-meta" style={{ marginTop: 8 }}>
            You will be redirected to PayPal to complete payment. Return to this site afterward—the report unlocks
            automatically.
          </p>
          <div className="row full" style={{ marginTop: 12 }}>
            <button className="btn primary" type="button" onClick={handlePayPalCheckout} disabled={busy}>
              {busy ? "Starting checkout..." : "Pay with PayPal"}
            </button>
          </div>
        </div>
      )}

      {(paid || firstCaseFreeApplied) && (
        <div className="card" style={{ marginTop: 12 }}>
          {payment?.reference && payment?.method === PAYPAL_CHECKOUT_METHOD && (
            <p className="auth-meta">
              PayPal capture: <code>{payment.reference}</code>
            </p>
          )}
          {firstCaseFreeApplied ? (
            <p>First case free credit is applied. The report is unlocked without payment.</p>
          ) : (
            <p>Payment recorded. The report is now unlocked.</p>
          )}
        </div>
      )}

      {checkoutStarted && !paid && (
        <div className="warning-box" style={{ marginTop: 12 }}>
          PayPal checkout was started. If you already paid, open the case again or use the link PayPal showed after
          payment. If the report is still locked, click <strong>Pay with PayPal</strong> again to resume.
        </div>
      )}

      {message && <p className="auth-meta">{message}</p>}
    </section>
  );
}

export default P2pPaymentPanel;
