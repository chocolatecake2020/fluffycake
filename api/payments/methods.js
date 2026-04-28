import { json, methodNotAllowed } from "./_utils.js";

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

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  return json(res, 200, methodCatalog);
}
