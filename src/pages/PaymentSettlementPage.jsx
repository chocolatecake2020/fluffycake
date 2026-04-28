import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  createCheckoutSession,
  createUsdtCharge,
  getPaymentStatus,
  listPaymentMethods,
  registerBankTransfer
} from "../api/paymentsApi";
import PaymentLogoStrip from "../components/payments/PaymentLogoStrip";
import { useAuth } from "../context/AuthContext";

const PLATFORM_FEE_USD = 4.99;
const STRIPE_RATE = { percent: 0.029, fixed: 0.3 };
const PAYPAL_RATE = { percent: 0.039, fixed: 0.49 };

function PaymentSettlementPage() {
  const location = useLocation();
  const { profile } = useAuth();
  const [methods, setMethods] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState({
    method: "card",
    amount: 450,
    currency: "USD",
    caseId: "cs-1001",
    network: "TRC20",
    remitterName: "",
    reference: ""
  });
  const returnStatus = useMemo(() => new URLSearchParams(location.search).get("status"), [location.search]);
  const feeEstimate = useMemo(() => {
    const amount = Number(form.amount) || 0;
    if (amount <= 0) return null;

    const isUSD = form.currency === "USD";
    const isCard = form.method === "card";
    const isPayPal = form.method === "paypal";
    if (!isCard && !isPayPal) return null;

    const rate = isCard ? STRIPE_RATE : PAYPAL_RATE;
    const pgFee = amount * rate.percent + rate.fixed;
    const platformGross = isUSD ? PLATFORM_FEE_USD : null;
    const platformNet = isUSD && platformGross !== null ? platformGross - pgFee : null;

    return {
      provider: isCard ? "Stripe" : "PayPal",
      pgFee,
      platformGross,
      platformNet
    };
  }, [form.amount, form.currency, form.method]);

  useEffect(() => {
    listPaymentMethods().then(setMethods);
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const caseId = query.get("caseId");
    if (!caseId) return;
    setForm((prev) => ({ ...prev, caseId }));
  }, [location.search]);

  useEffect(() => {
    const lastPaymentId = window.localStorage.getItem("vetbridge_last_payment_id");
    if (!lastPaymentId) return;

    let cancelled = false;
    const restoreLastPayment = async () => {
      setLoading(true);
      try {
        const status = await getPaymentStatus(lastPaymentId);
        if (!cancelled && status) {
          setResult(status);
        }
      } catch (_error) {
        // Ignore restore errors; manual check button is still available.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    restoreLastPayment();
    return () => {
      cancelled = true;
    };
  }, []);

  const onChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const createPayment = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      if (form.method === "usdt") {
        const data = await createUsdtCharge(form);
        setResult(data);
        if (data?.paymentId) window.localStorage.setItem("vetbridge_last_payment_id", data.paymentId);
      } else if (form.method === "bank") {
        const data = await registerBankTransfer(form);
        setResult(data);
        if (data?.paymentId) window.localStorage.setItem("vetbridge_last_payment_id", data.paymentId);
      } else {
        const data = await createCheckoutSession(form);
        setResult(data);
        if (data?.paymentId) window.localStorage.setItem("vetbridge_last_payment_id", data.paymentId);
      }
    } catch (error) {
      setErrorMessage(error.message || "Failed to create payment session.");
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    if (!result?.paymentId) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const status = await getPaymentStatus(result.paymentId);
      setResult(status);
    } catch (error) {
      setErrorMessage(error.message || "Failed to fetch payment status.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container narrow">
      <section className="card">
        <h2>Payment / Settlement</h2>
        <p>Pilot payment orchestration skeleton (mock provider APIs, ready for Stripe / PayPal / USDT gateway swap).</p>
        {returnStatus && <p className="auth-meta">Checkout returned with status: {returnStatus}</p>}
        <PaymentLogoStrip />
        <div className="grid two payment-method-grid">
          {methods.map((item) => (
            <article className="highlight-card payment-method-card" key={item.id}>
              <p className="highlight-label">{item.provider}</p>
              <p className="highlight-value">{item.label}</p>
              <small>{item.settlementWindow}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="card form-grid">
        <h3 className="full">Create Payment Session</h3>
        <div>
          <label>Method</label>
          <select name="method" value={form.method} onChange={onChange}>
            <option value="card">Credit Card</option>
            <option value="paypal">PayPal</option>
            <option value="usdt">USDT</option>
            <option value="bank">Bank Transfer</option>
          </select>
        </div>
        <div>
          <label>Amount</label>
          <input name="amount" type="number" value={form.amount} onChange={onChange} />
        </div>
        <div>
          <label>Currency</label>
          <select name="currency" value={form.currency} onChange={onChange}>
            <option value="USD">USD</option>
            <option value="KRW">KRW</option>
          </select>
        </div>
        <div>
          <label>Case ID</label>
          <input name="caseId" value={form.caseId} onChange={onChange} />
        </div>
        {form.method === "usdt" && (
          <div>
            <label>USDT Network</label>
            <select name="network" value={form.network} onChange={onChange}>
              <option value="TRC20">TRC20</option>
              <option value="ERC20">ERC20</option>
              <option value="SOL">SOL</option>
            </select>
          </div>
        )}
        {form.method === "bank" && (
          <>
            <div>
              <label>Remitter Name</label>
              <input name="remitterName" value={form.remitterName} onChange={onChange} />
            </div>
            <div>
              <label>Reference</label>
              <input name="reference" value={form.reference} onChange={onChange} />
            </div>
          </>
        )}
        <div className="row full">
          <button className="btn primary" type="button" onClick={createPayment} disabled={loading}>
            {loading ? "Processing..." : "Create Session"}
          </button>
          <button className="btn" type="button" onClick={checkStatus} disabled={loading || !result?.paymentId}>
            Check Status
          </button>
          {result?.paymentId && (
            <button
              className="btn"
              type="button"
              onClick={() => {
                window.localStorage.removeItem("vetbridge_last_payment_id");
                setResult(null);
              }}
            >
              Clear Result
            </button>
          )}
          {result?.redirectUrl && (
            <a className="btn" href={result.redirectUrl} target="_blank" rel="noreferrer">
              Open Checkout
            </a>
          )}
        </div>
        {feeEstimate && (
          profile?.role === "admin" && (
          <div className="full">
            <p className="auth-meta">
              Estimated {feeEstimate.provider} fee: ${feeEstimate.pgFee.toFixed(2)} (assumption).
            </p>
            {feeEstimate.platformGross !== null && (
              <p className="auth-meta">
                Estimated platform fee: ${feeEstimate.platformGross.toFixed(2)} | Estimated net after PG fee: $
                {feeEstimate.platformNet.toFixed(2)}
              </p>
            )}
            {form.currency !== "USD" && (
              <p className="auth-meta">KRW 결제는 고정수수료 환산이 달라 실제 정산과 차이가 날 수 있습니다.</p>
            )}
          </div>
          )
        )}
        {errorMessage && <p className="auth-meta full">{errorMessage}</p>}
      </section>

      {result && (
        <section className="card">
          <h3>Payment Status</h3>
          <div className="payment-status-grid">
            <p><strong>Payment ID:</strong> <span className="mono">{result.paymentId}</span></p>
            <p><strong>Method:</strong> {result.method}</p>
            <p><strong>Provider:</strong> {result.provider}</p>
            <p><strong>Status:</strong> {result.status}</p>
            <p><strong>Amount:</strong> {result.amount} {result.currency}</p>
            {result.network && <p><strong>Network:</strong> {result.network}</p>}
            {result.depositAddress && <p><strong>Deposit Address:</strong> <span className="mono">{result.depositAddress}</span></p>}
            {result.expiresAt && <p><strong>Expires At:</strong> {result.expiresAt}</p>}
          </div>
        </section>
      )}

      <section className="card">
        <p>Payment options may vary by country and pilot agreement.</p>
        <p>Final payment confirmation should be webhook-driven in production.</p>
      </section>
    </main>
  );
}

export default PaymentSettlementPage;
