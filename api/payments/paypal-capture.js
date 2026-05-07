import { json, methodNotAllowed } from "./_utils.js";
import { createPayPalAccessToken } from "./_paypal.js";

async function fetchOrder(apiBase, accessToken, orderId) {
  const res = await fetch(`${apiBase}/v2/checkout/orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) return null;
  return res.json();
}

function extractCapture(order) {
  const pu = order?.purchase_units?.[0];
  const captures = pu?.payments?.captures;
  if (!Array.isArray(captures) || !captures.length) return null;
  const c = captures[0];
  return {
    captureId: c.id,
    amount: c.amount?.value,
    currency: c.amount?.currency_code,
    status: c.status
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body || "{}");
    } catch (_e) {
      body = {};
    }
  }

  const orderId = body?.orderId || body?.token;
  if (!orderId || typeof orderId !== "string") {
    return json(res, 400, { message: "orderId (PayPal order ID) is required." });
  }

  try {
    const { accessToken, apiBase } = await createPayPalAccessToken();

    const captureRes = await fetch(`${apiBase}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });

    let orderJson = null;
    if (captureRes.ok) {
      orderJson = await captureRes.json();
    } else {
      const errText = await captureRes.text();
      orderJson = await fetchOrder(apiBase, accessToken, orderId);
      if (orderJson?.status === "COMPLETED") {
        const cap = extractCapture(orderJson);
        if (cap?.captureId) {
          return json(res, 200, {
            ok: true,
            orderStatus: orderJson.status,
            orderId: orderJson.id,
            captureId: cap.captureId,
            amount: cap.amount,
            currency: cap.currency,
            alreadyCaptured: true
          });
        }
      }
      return json(res, 502, {
        message: errText || "PayPal capture failed.",
        orderStatus: orderJson?.status || null
      });
    }

    const cap = extractCapture(orderJson);
    if (!cap?.captureId) {
      return json(res, 502, { message: "Capture succeeded but no capture id in response." });
    }

    return json(res, 200, {
      ok: true,
      orderStatus: orderJson.status,
      orderId: orderJson.id,
      captureId: cap.captureId,
      amount: cap.amount,
      currency: cap.currency,
      alreadyCaptured: false
    });
  } catch (error) {
    return json(res, 500, { message: error.message || "PayPal capture error." });
  }
}
