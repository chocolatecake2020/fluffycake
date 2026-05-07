import process from "node:process";

/**
 * PayPal REST OAuth + API base.
 * Production: set PAYPAL_API_BASE=https://api-m.paypal.com (and live client/secret).
 * Sandbox default: https://api-m.sandbox.paypal.com
 */
export async function createPayPalAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const apiBase =
    process.env.PAYPAL_API_BASE ||
    (process.env.PAYPAL_ENV === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com");

  if (!clientId || !clientSecret) {
    throw new Error("Missing PayPal credentials (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).");
  }

  const response = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Failed to get PayPal access token.");
  }
  const data = await response.json();
  return { accessToken: data.access_token, apiBase };
}
