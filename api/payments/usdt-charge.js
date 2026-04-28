import { asNumber, json, methodNotAllowed } from "./_utils.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const payload = req.body || {};
  const amount = asNumber(payload.amount, 0);
  if (amount <= 0) return json(res, 400, { message: "Amount must be greater than zero." });

  const paymentId = `usdt_${Date.now()}`;
  return json(res, 200, {
    paymentId,
    method: "usdt",
    provider: "USDT Settlement",
    status: "awaiting_transfer",
    amount,
    currency: payload.currency || "USD",
    network: payload.network || "TRC20",
    depositAddress: process.env.USDT_DEPOSIT_ADDRESS || "TXXxMockWalletAddressForPilotOnly",
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString()
  });
}
