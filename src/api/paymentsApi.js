import { hasSupabaseConfig, supabase } from "../lib/supabaseClient";

const wait = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));

const inMemoryPayments = new Map();
const inMemoryPayouts = new Map();
const useSupabaseStore = hasSupabaseConfig && !!supabase;
const paymentsApiBaseUrl = import.meta.env.VITE_PAYMENTS_API_BASE_URL || "";
const stripePaymentLink = import.meta.env.VITE_STRIPE_PAYMENT_LINK || "";
const paypalPaymentLink = import.meta.env.VITE_PAYPAL_PAYMENT_LINK || "";

const PLATFORM_FEE_USD = Number(import.meta.env.VITE_PLATFORM_FEE_USD || 4.99);
const DEFAULT_CASE_PRICE_USD = Number(import.meta.env.VITE_CASE_PRICE_USD || 4.99);

const RAW_PAYMENT_MODE = String(import.meta.env.VITE_PAYMENT_MODE || "p2p").toLowerCase();
const PAYMENT_MODE = ["p2p", "platform", "both"].includes(RAW_PAYMENT_MODE) ? RAW_PAYMENT_MODE : "p2p";

export function getPaymentMode() {
  return PAYMENT_MODE;
}

export function isP2pEnabled() {
  return PAYMENT_MODE === "p2p" || PAYMENT_MODE === "both";
}

export function isPlatformCheckoutEnabled() {
  return PAYMENT_MODE === "platform" || PAYMENT_MODE === "both";
}

export function getPlatformFeeUsd() {
  return PLATFORM_FEE_USD;
}

export function getDefaultCasePriceUsd() {
  return DEFAULT_CASE_PRICE_USD;
}

export const P2P_STATUSES = Object.freeze({
  AWAITING_CLINIC_PAYMENT: "awaiting_clinic_payment",
  AWAITING_ADMIN_CONFIRMATION: "awaiting_admin_confirmation",
  PAID: "paid",
  REJECTED: "rejected"
});

export const P2P_PROVIDER = "PayPal (Direct P2P)";
export const P2P_METHOD = "p2p_paypal";
export const FIRST_FREE_METHOD = "first_case_free";
export const FIRST_FREE_PROVIDER = "VetBridge First Case Promo";

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

function normalizePaymentRow(row) {
  if (!row) return null;
  return {
    paymentId: row.payment_id,
    method: row.method,
    provider: row.provider,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    caseId: row.case_id,
    network: row.network,
    depositAddress: row.deposit_address,
    reference: row.reference,
    remitterName: row.remitter_name,
    redirectUrl: row.redirect_url,
    paypalRecipientEmail: row.paypal_recipient_email || null,
    transactionReference: row.transaction_reference || row.reference || null,
    proofUrl: row.proof_url || null,
    rejectionReason: row.rejection_reason || null,
    rawPayload: row.raw_payload || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

async function upsertP2pRow(row) {
  if (!useSupabaseStore) {
    const memory = {
      paymentId: row.payment_id,
      method: row.method,
      provider: row.provider,
      status: row.status,
      amount: row.amount,
      currency: row.currency,
      caseId: row.case_id,
      paypalRecipientEmail: row.paypal_recipient_email,
      transactionReference: row.transaction_reference,
      proofUrl: row.proof_url,
      rejectionReason: row.rejection_reason,
      reference: row.transaction_reference || null,
      createdAt: inMemoryPayments.get(row.payment_id)?.createdAt || new Date().toISOString()
    };
    inMemoryPayments.set(row.payment_id, memory);
    return memory;
  }

  const { data, error } = await supabase
    .from("payment_transactions")
    .upsert(row, { onConflict: "payment_id" })
    .select()
    .single();
  if (error) throw error;
  return normalizePaymentRow(data);
}

export async function createP2pPayment({ caseId, paypalRecipientEmail, amount, currency = "USD" } = {}) {
  if (!caseId) throw new Error("caseId is required.");
  if (!paypalRecipientEmail) throw new Error("Reviewer's PayPal email is required.");
  const paymentId = `p2p_${caseId}_${Date.now()}`;
  return upsertP2pRow({
    payment_id: paymentId,
    method: P2P_METHOD,
    provider: P2P_PROVIDER,
    status: P2P_STATUSES.AWAITING_CLINIC_PAYMENT,
    amount: Number(amount || DEFAULT_CASE_PRICE_USD),
    currency,
    case_id: caseId,
    paypal_recipient_email: paypalRecipientEmail,
    raw_payload: { mode: "p2p", initiatedAt: new Date().toISOString() }
  });
}

async function uploadP2pProof(caseId, paymentId, file) {
  if (!useSupabaseStore || !file) return null;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `payment-proofs/${caseId}/${paymentId}-${Date.now()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("case-files")
    .upload(path, file, { upsert: false, cacheControl: "3600" });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from("case-files").getPublicUrl(path);
  return data?.publicUrl || null;
}

export async function submitP2pConfirmation({ paymentId, caseId, transactionReference, proofFile } = {}) {
  if (!paymentId) throw new Error("paymentId is required.");
  if (!transactionReference) throw new Error("PayPal transaction reference is required.");
  if (!proofFile) throw new Error("Payment proof screenshot is required.");

  const proofUrl = await uploadP2pProof(caseId, paymentId, proofFile);

  // Pilot UX: clinic submits TxID + screenshot -> auto-mark as paid and unlock report.
  // Admin retains a Reject option to roll back disputed payments.
  const result = await upsertP2pRow({
    payment_id: paymentId,
    method: P2P_METHOD,
    provider: P2P_PROVIDER,
    status: P2P_STATUSES.PAID,
    case_id: caseId,
    transaction_reference: transactionReference,
    reference: transactionReference,
    proof_url: proofUrl,
    raw_payload: {
      mode: "p2p",
      submittedAt: new Date().toISOString(),
      autoApproved: true,
      transactionReference,
      proofUrl
    }
  });

  if (caseId) {
    try {
      await recheckPayout(caseId);
    } catch (_payoutError) {
      // Payout queue refresh should never block the clinic flow.
    }
  }

  return result;
}

// One-shot helper used by the clinic UI: ensures a payment record exists,
// uploads the screenshot, and moves the status to awaiting_admin_confirmation
// in a single user action.
export async function submitP2pPayment({
  caseId,
  paypalRecipientEmail,
  amount,
  currency = "USD",
  transactionReference,
  proofFile
} = {}) {
  if (!caseId) throw new Error("caseId is required.");
  if (!paypalRecipientEmail) throw new Error("Reviewer's PayPal email is required.");
  if (!transactionReference) throw new Error("PayPal transaction reference is required.");
  if (!proofFile) throw new Error("Payment proof screenshot is required.");

  let payment = await getPaymentForCase(caseId);
  if (!payment || payment.method !== P2P_METHOD) {
    payment = await createP2pPayment({
      caseId,
      paypalRecipientEmail,
      amount,
      currency
    });
  }

  return submitP2pConfirmation({
    paymentId: payment.paymentId,
    caseId,
    transactionReference,
    proofFile
  });
}

const PAYPAL_TX_ID_REGEX = /^[A-Z0-9]{17}$/;

export function isValidPaypalTransactionId(value) {
  if (!value) return false;
  return PAYPAL_TX_ID_REGEX.test(String(value).trim().toUpperCase());
}

export const PAYPAL_SEND_MONEY_URL = "https://www.paypal.com/myaccount/transfer/homepage/pay";

export async function approveP2pPayment({ paymentId, caseId, approvedBy } = {}) {
  if (!paymentId) throw new Error("paymentId is required.");
  const result = await upsertP2pRow({
    payment_id: paymentId,
    method: P2P_METHOD,
    provider: P2P_PROVIDER,
    status: P2P_STATUSES.PAID,
    case_id: caseId,
    raw_payload: {
      mode: "p2p",
      approvedAt: new Date().toISOString(),
      approvedBy: approvedBy || null
    }
  });
  if (caseId) {
    try {
      await recheckPayout(caseId);
    } catch (_payoutError) {
      // Payout queue refresh should not block approval result.
    }
  }
  return result;
}

export async function rejectP2pPayment({ paymentId, caseId, reason, rejectedBy } = {}) {
  if (!paymentId) throw new Error("paymentId is required.");
  return upsertP2pRow({
    payment_id: paymentId,
    method: P2P_METHOD,
    provider: P2P_PROVIDER,
    status: P2P_STATUSES.REJECTED,
    case_id: caseId,
    rejection_reason: reason || "Rejected by admin",
    raw_payload: {
      mode: "p2p",
      rejectedAt: new Date().toISOString(),
      rejectedBy: rejectedBy || null,
      reason: reason || null
    }
  });
}

export async function listPendingP2pConfirmations() {
  if (!useSupabaseStore) {
    return Array.from(inMemoryPayments.values())
      .filter(
        (item) =>
          item.method === P2P_METHOD &&
          item.status === P2P_STATUSES.AWAITING_ADMIN_CONFIRMATION
      )
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }
  const { data, error } = await supabase
    .from("payment_transactions")
    .select("*")
    .eq("method", P2P_METHOD)
    .eq("status", P2P_STATUSES.AWAITING_ADMIN_CONFIRMATION)
    .order("created_at", { ascending: false });
  if (error || !Array.isArray(data)) return [];
  return data.map(normalizePaymentRow);
}

export async function listRecentP2pPayments({ limit = 50 } = {}) {
  if (!useSupabaseStore) {
    return Array.from(inMemoryPayments.values())
      .filter((item) => item.method === P2P_METHOD)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      .slice(0, limit);
  }
  const { data, error } = await supabase
    .from("payment_transactions")
    .select("*")
    .eq("method", P2P_METHOD)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !Array.isArray(data)) return [];
  return data.map(normalizePaymentRow);
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

const PAID_STATUSES = new Set(["paid", "succeeded", "completed", "confirmed", "authorized", "settled"]);

export function isPaymentPaid(payment) {
  if (!payment?.status) return false;
  return PAID_STATUSES.has(String(payment.status).toLowerCase());
}

export async function claimFirstFreeCase({ caseId, clinicId } = {}) {
  if (!caseId || !clinicId) return { applied: false, reason: "missing_identifiers" };

  const existingCasePayment = await getPaymentForCase(caseId);
  if (isPaymentPaid(existingCasePayment)) {
    return {
      applied: existingCasePayment?.method === FIRST_FREE_METHOD,
      reason: existingCasePayment?.method === FIRST_FREE_METHOD ? "already_applied_on_case" : "already_paid"
    };
  }

  if (!useSupabaseStore) {
    const alreadyConsumed = Array.from(inMemoryPayments.values()).some(
      (payment) => payment?.method === FIRST_FREE_METHOD && isPaymentPaid(payment)
    );
    if (alreadyConsumed) return { applied: false, reason: "already_consumed" };
    const freePayment = {
      paymentId: `free_${caseId}`,
      method: FIRST_FREE_METHOD,
      provider: FIRST_FREE_PROVIDER,
      status: "paid",
      amount: 0,
      currency: "USD",
      caseId,
      createdAt: new Date().toISOString(),
      rawPayload: { promo: "first_case_free", appliedAt: new Date().toISOString(), clinicId }
    };
    await upsertPaymentRecord(freePayment);
    return { applied: true, payment: freePayment, reason: "applied" };
  }

  const { data: firstClinicCase, error: firstCaseError } = await supabase
    .from("cases")
    .select("id")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (firstCaseError) return { applied: false, reason: "first_case_lookup_failed" };
  if (!firstClinicCase?.id || firstClinicCase.id !== caseId) {
    return { applied: false, reason: "not_first_case" };
  }

  const { data: clinicCases, error: clinicCasesError } = await supabase
    .from("cases")
    .select("id")
    .eq("clinic_id", clinicId);
  if (clinicCasesError || !Array.isArray(clinicCases)) {
    return { applied: false, reason: "clinic_cases_lookup_failed" };
  }
  const caseIds = clinicCases.map((row) => row.id).filter(Boolean);
  if (!caseIds.length) return { applied: false, reason: "no_clinic_cases" };

  const { data: txRows, error: txError } = await supabase
    .from("payment_transactions")
    .select("case_id, status, method")
    .in("case_id", caseIds);
  if (txError) return { applied: false, reason: "payments_lookup_failed" };

  const consumed = (txRows || []).some(
    (row) => row?.method === FIRST_FREE_METHOD && isPaymentPaid(row)
  );
  if (consumed) return { applied: false, reason: "already_consumed" };

  const anyPaid = (txRows || []).some((row) => isPaymentPaid(row));
  if (anyPaid) return { applied: false, reason: "already_paid_case_exists" };

  const freePayment = {
    paymentId: `free_${caseId}`,
    method: FIRST_FREE_METHOD,
    provider: FIRST_FREE_PROVIDER,
    status: "paid",
    amount: 0,
    currency: "USD",
    caseId,
    rawPayload: { promo: "first_case_free", appliedAt: new Date().toISOString(), clinicId }
  };
  await upsertPaymentRecord(freePayment);
  return { applied: true, payment: freePayment, reason: "applied" };
}

export async function listPaidCaseIds() {
  if (!useSupabaseStore) {
    const ids = new Set();
    inMemoryPayments.forEach((payment) => {
      if (payment.caseId && isPaymentPaid(payment)) ids.add(payment.caseId);
    });
    return ids;
  }
  const { data, error } = await supabase
    .from("payment_transactions")
    .select("case_id, status")
    .not("case_id", "is", null);
  if (error || !Array.isArray(data)) return new Set();
  const ids = new Set();
  data.forEach((row) => {
    if (row.case_id && isPaymentPaid(row)) ids.add(row.case_id);
  });
  return ids;
}

export async function getPaymentForCase(caseId) {
  if (!caseId) return null;
  if (!useSupabaseStore) {
    let latest = null;
    inMemoryPayments.forEach((payment) => {
      if (payment.caseId !== caseId) return;
      if (!latest || (payment.createdAt || "") > (latest.createdAt || "")) latest = payment;
    });
    return latest;
  }
  const { data, error } = await supabase
    .from("payment_transactions")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !Array.isArray(data) || data.length === 0) return null;
  return normalizePaymentRow(data[0]);
}

function normalizePayoutRow(row) {
  if (!row) return null;
  return {
    id: row.id ?? null,
    caseId: row.case_id ?? row.caseId ?? null,
    reviewerId: row.reviewer_id ?? row.reviewerId ?? null,
    reviewerEmail: row.reviewer_email ?? row.reviewerEmail ?? null,
    paypalEmail: row.paypal_email ?? row.paypalEmail ?? null,
    grossAmount: Number(row.gross_amount ?? row.grossAmount ?? 0),
    platformFee: Number(row.platform_fee ?? row.platformFee ?? 0),
    netAmount: Number(row.net_amount ?? row.netAmount ?? 0),
    currency: row.currency ?? "USD",
    status: row.status ?? "pending",
    notes: row.notes ?? "",
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null
  };
}

function calculatePayoutAmounts(grossAmount) {
  const gross = Number(grossAmount || 0) || DEFAULT_CASE_PRICE_USD;
  const fee = Math.min(PLATFORM_FEE_USD, gross);
  const net = Math.max(0, Number((gross - fee).toFixed(2)));
  return {
    gross: Number(gross.toFixed(2)),
    fee: Number(fee.toFixed(2)),
    net
  };
}

async function fetchReviewerPayoutEmail(reviewerId) {
  if (!reviewerId || !useSupabaseStore) return "";
  const { data, error } = await supabase
    .from("user_profiles")
    .select("paypal_email, email")
    .eq("id", reviewerId)
    .single();
  if (error || !data) return "";
  return (data.paypal_email || "").trim();
}

export async function enqueuePayoutForReportSubmission({
  caseId,
  reviewerId,
  reviewerEmail
} = {}) {
  if (!caseId || !reviewerId) {
    return { skipped: true, reason: "missing_identifiers" };
  }

  const payment = await getPaymentForCase(caseId);
  const paid = isPaymentPaid(payment);
  const grossAmount = paid ? Number(payment?.amount || DEFAULT_CASE_PRICE_USD) : DEFAULT_CASE_PRICE_USD;
  const { gross, fee, net } = calculatePayoutAmounts(grossAmount);

  const paypalEmail = await fetchReviewerPayoutEmail(reviewerId);

  let status = "pending";
  let notes = "";
  if (!paid) {
    status = "blocked";
    notes = "Awaiting payment to clear before reviewer payout.";
  } else if (!paypalEmail) {
    status = "blocked";
    notes = "Reviewer has not provided a PayPal email for payout.";
  }

  const record = {
    caseId,
    reviewerId,
    reviewerEmail: reviewerEmail || null,
    paypalEmail: paypalEmail || null,
    grossAmount: gross,
    platformFee: fee,
    netAmount: net,
    currency: payment?.currency || "USD",
    status,
    notes,
    createdAt: new Date().toISOString()
  };

  if (!useSupabaseStore) {
    inMemoryPayouts.set(caseId, record);
    return { enqueued: true, payout: record };
  }

  const row = {
    case_id: caseId,
    reviewer_id: reviewerId,
    reviewer_email: reviewerEmail || null,
    paypal_email: paypalEmail || null,
    gross_amount: gross,
    platform_fee: fee,
    net_amount: net,
    currency: payment?.currency || "USD",
    status,
    notes
  };
  const { data, error } = await supabase
    .from("payouts")
    .upsert(row, { onConflict: "case_id" })
    .select()
    .single();
  if (error) {
    inMemoryPayouts.set(caseId, record);
    return { enqueued: true, fallback: true, payout: record, error: error.message };
  }
  return { enqueued: true, payout: normalizePayoutRow(data) };
}

export async function listPayouts({ status } = {}) {
  if (!useSupabaseStore) {
    const items = Array.from(inMemoryPayouts.values());
    const filtered = status ? items.filter((item) => item.status === status) : items;
    return filtered.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }
  let query = supabase.from("payouts").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error || !Array.isArray(data)) return [];
  return data.map(normalizePayoutRow);
}

export async function recheckPayout(caseId) {
  if (!caseId) return null;
  const existing = await getPayoutForCase(caseId);
  if (!existing) return null;
  const refreshed = await enqueuePayoutForReportSubmission({
    caseId,
    reviewerId: existing.reviewerId,
    reviewerEmail: existing.reviewerEmail
  });
  return refreshed;
}

export async function getPayoutForCase(caseId) {
  if (!caseId) return null;
  if (!useSupabaseStore) return inMemoryPayouts.get(caseId) || null;
  const { data, error } = await supabase
    .from("payouts")
    .select("*")
    .eq("case_id", caseId)
    .single();
  if (error || !data) return null;
  return normalizePayoutRow(data);
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
