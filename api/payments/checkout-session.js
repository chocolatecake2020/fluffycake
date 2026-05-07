import Stripe from "stripe";
import { asNumber, getBaseUrl, json, methodNotAllowed } from "./_utils.js";
import { createPayPalAccessToken } from "./_paypal.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    const payload = req.body || {};
    const method = payload.method || "card";
    const amount = asNumber(payload.amount, 0);
    const currency = payload.currency || "USD";
    const caseId = payload.caseId || null;

    if (amount <= 0) {
      return json(res, 400, { message: "Amount must be greater than zero." });
    }

    if (method === "paypal") {
      const { accessToken, apiBase } = await createPayPalAccessToken();
      const baseUrl = getBaseUrl(req);
      const returnPath =
        caseId != null && String(caseId).length
          ? `/payments?caseId=${encodeURIComponent(String(caseId))}&paypal_return=1`
          : "/payments?paypal_return=1";
      const returnUrl = process.env.PAYPAL_RETURN_URL || `${baseUrl}${returnPath}`;
      const cancelUrl =
        process.env.PAYPAL_CANCEL_URL ||
        (caseId != null && String(caseId).length
          ? `${baseUrl}/cases/${encodeURIComponent(String(caseId))}#payment`
          : `${baseUrl}/payments`);

      const response = await fetch(`${apiBase}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: caseId || `case-${Date.now()}`,
              description: caseId
                ? `VetBridge case review (case ${caseId})`
                : "VetBridge case review",
              amount: { currency_code: currency, value: amount.toFixed(2) }
            }
          ],
          application_context: {
            brand_name: "VetBridge",
            landing_page: "NO_PREFERENCE",
            user_action: "PAY_NOW",
            return_url: returnUrl,
            cancel_url: cancelUrl
          }
        })
      });

      if (!response.ok) {
        const message = await response.text();
        return json(res, 502, { message: message || "PayPal order creation failed." });
      }
      const order = await response.json();
      const approveLink = Array.isArray(order.links) ? order.links.find((link) => link.rel === "approve") : null;

      return json(res, 200, {
        paymentId: `paypal_${order.id}`,
        method: "paypal",
        provider: "PayPal Checkout",
        status: "redirect_required",
        amount,
        currency,
        caseId,
        createdAt: new Date().toISOString(),
        redirectUrl: approveLink?.href || null
      });
    }

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      return json(res, 500, { message: "Missing STRIPE_SECRET_KEY." });
    }
    const stripe = new Stripe(stripeSecret);
    const baseUrl = getBaseUrl(req);
    const successUrl = process.env.STRIPE_SUCCESS_URL || `${baseUrl}/payments`;
    const cancelUrl = process.env.STRIPE_CANCEL_URL || `${baseUrl}/payments`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        caseId: caseId || "",
        source: "vetbridge"
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: caseId ? `VetBridge Case Review (${caseId})` : "VetBridge Case Review"
            }
          }
        }
      ]
    });

    return json(res, 200, {
      paymentId: `stripe_${session.id}`,
      method: "card",
      provider: "Stripe",
      status: "redirect_required",
      amount,
      currency,
      caseId,
      createdAt: new Date().toISOString(),
      redirectUrl: session.url || null
    });
  } catch (error) {
    return json(res, 500, { message: error.message || "Checkout session creation failed." });
  }
}
