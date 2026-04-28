import { hasSupabaseConfig, supabase } from "../lib/supabaseClient";

const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

const inMemoryPayments = new Map();
const useSupabaseStore = hasSupabaseConfig && !!supabase;
const paymentsApiBaseUrl = import.meta.env.VITE_PAYMENTS_API_BASE_URL || "";
const stripePaymentLink = import.meta.env.VITE_STRIPE_PAYMENT_LINK || "";
const paypalPaymentLink = import.meta.env.VITE_PAYPAL_PAYMENT_LINK || "";

const methodCatalog = [
  {
    id: "card",
    label: "Credit Card (Visa / Mastercard)",
    provider: "Stripe",
    settlementWindow: "Instant to same day"
  },
  {
    id: "paypal",
    label: "PayPal",
    provider: "PayPal Checkout",
    settlementWindow: "Same day"
  },
  {
    id: "usdt",
    label: "USDT (supported pilot regions)",
    provider: "USDT Settlement",
    settlementWindow: "Network confirmation based"
  },
  {
    id: "bank",
    label: "Bank Transfer",
    provider: "Manual settlement",
    settlementWindow: "1-3 business days"
  }
];

async function requestGateway(path, options = {}) {
  if (!paymentsApiBaseUrl) return null;
  const response = await fetch(`${paymentsApiBaseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Payment gateway request failed (${response.status})`);
  }
  return response.json();
}

async function upsertPaymentRecord(payment) {
  if (!useSupabaseStore) {
    inMemoryPayments.set(payment.paymentId, payment);
    return payment;
  }

  const row = {
    payment_id: payment.paymentId,
    method: payment.method,
    provider: payment.provider,
    status: payment.status,
    amount: Number(payment.amount || 0),
    currency: payment.currency || "USD",
    case_id: payment.caseId || null,
    network: payment.network || null,
    deposit_address: payment.depositAddress || null,
    reference: payment.reference || null,
    remitter_name: payment.remitterName || null,
    redirect_url: payment.redirectUrl || null,
    raw_payload: payment
  };
  const { error } = await supabase.from("payment_transactions").upsert(row, { onConflict: "payment_id" });
  if (error) {
    // Fallback to memory if table is not created yet.
    inMemoryPayments.set(payment.paymentId, payment);
  }
  return payment;
}

async function getPersistedPayment(paymentId) {
  if (!paymentId) return null;
  if (useSupabaseStore) {
    const { data, error } = await supabase
      .from("payment_transactions")
      .select("*")
      .eq("payment_id", paymentId)
      .single();
    if (!error && data) {
      return {
        paymentId: data.payment_id,
        method: data.method,
        provider: data.provider,
        status: data.status,
        amount: data.amount,
        currency: data.currency,
        caseId: data.case_id,
        network: data.network,
        depositAddress: data.deposit_address,
        reference: data.reference,
        remitterName: data.remitter_name,
        redirectUrl: data.redirect_url,
        checkedAt: new Date().toISOString()
      };
    }
  }
  return inMemoryPayments.get(paymentId) || null;
}

export async function listPaymentMethods() {
  if (paymentsApiBaseUrl) {
    const remote = await requestGateway("/methods");
    if (Array.isArray(remote)) return remote;
  }
  await wait(120);
  return methodCatalog;
}

export async function createCheckoutSession(payload) {
  if (paymentsApiBaseUrl) {
    const remote = await requestGateway("/checkout-session", { method: "POST", body: payload });
    return upsertPaymentRecord(remote);
  }

  await wait();
  const paymentId = `pay_${Date.now()}`;
  const method = payload.method;
  const provider = method === "paypal" ? "PayPal Checkout" : "Stripe";
  const configuredRedirect = method === "paypal" ? paypalPaymentLink : stripePaymentLink;
  const payment = {
    paymentId,
    method,
    provider,
    status: configuredRedirect ? "redirect_required" : "pending",
    amount: Number(payload.amount),
    currency: payload.currency,
    caseId: payload.caseId || null,
    createdAt: new Date().toISOString(),
    redirectUrl: configuredRedirect || null
  };
  return upsertPaymentRecord(payment);
}

export async function createUsdtCharge(payload) {
  if (paymentsApiBaseUrl) {
    const remote = await requestGateway("/usdt-charge", { method: "POST", body: payload });
    return upsertPaymentRecord(remote);
  }

  await wait();
  const paymentId = `usdt_${Date.now()}`;
  const payment = {
    paymentId,
    method: "usdt",
    provider: "USDT Settlement",
    status: "awaiting_transfer",
    amount: Number(payload.amount),
    currency: payload.currency,
    network: payload.network || "TRC20",
    depositAddress: "TXXxMockWalletAddressForPilotOnly",
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
  };
  return upsertPaymentRecord(payment);
}

export async function registerBankTransfer(payload) {
  if (paymentsApiBaseUrl) {
    const remote = await requestGateway("/bank-transfer", { method: "POST", body: payload });
    return upsertPaymentRecord(remote);
  }

  await wait();
  const paymentId = `bank_${Date.now()}`;
  const payment = {
    paymentId,
    method: "bank",
    provider: "Manual settlement",
    status: "pending_review",
    amount: Number(payload.amount),
    currency: payload.currency,
    remitterName: payload.remitterName || "Unknown",
    reference: payload.reference || ""
  };
  return upsertPaymentRecord(payment);
}

export async function getPaymentStatus(paymentId) {
  if (paymentsApiBaseUrl) {
    const remote = await requestGateway(`/status/${paymentId}`);
    return upsertPaymentRecord(remote);
  }

  await wait(180);
  const existing = await getPersistedPayment(paymentId);
  if (!existing) return null;

  let nextStatus = existing.status;
  if (existing.status === "pending") nextStatus = "authorized";
  if (existing.status === "awaiting_transfer") nextStatus = "confirming";
  if (existing.status === "redirect_required") nextStatus = "redirect_required";

  const updated = { ...existing, status: nextStatus, checkedAt: new Date().toISOString() };
  return upsertPaymentRecord(updated);
}
