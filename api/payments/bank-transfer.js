import { asNumber, json, methodNotAllowed } from "./_utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const payload = req.body || {};
  const amount = asNumber(payload.amount, 0);
  if (amount <= 0) return json(res, 400, { message: "Amount must be greater than zero." });

  return json(res, 200, {
    paymentId: `bank_${Date.now()}`,
    method: "bank",
    provider: "Manual settlement",
    status: "pending_review",
    amount,
    currency: payload.currency || "USD",
    remitterName: payload.remitterName || "",
    reference: payload.reference || "",
    createdAt: new Date().toISOString()
  });
}
