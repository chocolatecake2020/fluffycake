import Stripe from "stripe";
import { json, methodNotAllowed } from "../_utils.js";

async function createPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const apiBase = process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com";
  if (!clientId || !clientSecret) throw new Error("Missing PayPal credentials.");

  const response = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!response.ok) throw new Error("Failed to get PayPal access token.");
  const data = await response.json();
  return { accessToken: data.access_token, apiBase };
}

function mapStripeStatus(status) {
  if (status === "complete") return "authorized";
  if (status === "expired") return "expired";
  if (status === "open") return "pending";
  return "pending";
}

function mapPayPalStatus(status) {
  if (status === "COMPLETED") return "authorized";
  if (status === "APPROVED") return "approved";
  if (status === "PAYER_ACTION_REQUIRED") return "pending";
  return "pending";
}

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  const { paymentId } = req.query;
  if (!paymentId) return json(res, 400, { message: "paymentId is required." });

  try {
    if (String(paymentId).startsWith("stripe_")) {
      const stripeSecret = process.env.STRIPE_SECRET_KEY;
      if (!stripeSecret) return json(res, 500, { message: "Missing STRIPE_SECRET_KEY." });
      const stripe = new Stripe(stripeSecret);
      const sessionId = String(paymentId).replace("stripe_", "");
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      return json(res, 200, {
        paymentId,
        method: "card",
        provider: "Stripe",
        status: mapStripeStatus(session.status),
        amount: session.amount_total ? session.amount_total / 100 : 0,
        currency: (session.currency || "usd").toUpperCase(),
        checkedAt: new Date().toISOString()
      });
    }

    if (String(paymentId).startsWith("paypal_")) {
      const orderId = String(paymentId).replace("paypal_", "");
      const { accessToken, apiBase } = await createPayPalAccessToken();
      const response = await fetch(`${apiBase}/v2/checkout/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) {
        const message = await response.text();
        return json(res, 502, { message: message || "Failed to fetch PayPal order status." });
      }
      const order = await response.json();
      const amount = Number(order.purchase_units?.[0]?.amount?.value || 0);
      const currency = order.purchase_units?.[0]?.amount?.currency_code || "USD";
      return json(res, 200, {
        paymentId,
        method: "paypal",
        provider: "PayPal Checkout",
        status: mapPayPalStatus(order.status),
        amount,
        currency,
        checkedAt: new Date().toISOString()
      });
    }

    return json(res, 200, {
      paymentId,
      method: "manual",
      provider: "Manual settlement",
      status: "pending_review",
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    return json(res, 500, { message: error.message || "Failed to get payment status." });
  }
}
