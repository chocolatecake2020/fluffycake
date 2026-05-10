// Vercel serverless function that fans out internal lifecycle events
// (user_signup / case_submitted / report_submitted) to the operations inbox
// using the Resend HTTP API. Frontend calls this fire-and-forget; failures
// must never affect the originating user flow.

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (parseError) {
        reject(parseError);
      }
    });
    req.on("error", reject);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const EVENT_TITLES = {
  user_signup: "New user signup",
  case_submitted: "New case submitted",
  report_submitted: "Report submitted"
};

const ALLOWED_EVENTS = new Set(Object.keys(EVENT_TITLES));

function buildEmail(event, payload) {
  const niceName = EVENT_TITLES[event] || "VetBridge event";
  const rows = Object.entries(payload || {}).map(
    ([key, value]) =>
      `<tr><td style="padding:4px 8px;border:1px solid #ddd"><strong>${escapeHtml(
        key
      )}</strong></td><td style="padding:4px 8px;border:1px solid #ddd">${escapeHtml(value)}</td></tr>`
  );
  const subject = `[VetBridge] ${niceName}`;
  const html = `
    <h2 style="margin:0 0 12px">${escapeHtml(niceName)}</h2>
    <p style="margin:0 0 12px">Event: <code>${escapeHtml(event)}</code></p>
    <table style="border-collapse:collapse;border:1px solid #ddd">${rows.join("")}</table>
    <p style="margin:12px 0 0;color:#666">Time: ${escapeHtml(new Date().toISOString())}</p>
  `;
  const text = [
    niceName,
    `Event: ${event}`,
    ...Object.entries(payload || {}).map(([k, v]) => `${k}: ${v}`),
    `Time: ${new Date().toISOString()}`
  ].join("\n");
  return { subject, html, text };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.NOTIFY_TO_EMAIL || "vetbridgesupport@gmail.com";
  const fromEmail = process.env.NOTIFY_FROM_EMAIL || "VetBridge <onboarding@resend.dev>";

  // No-op gracefully when the key is missing so callers can keep firing
  // without backend prerequisites being satisfied yet (pilot setup).
  if (!apiKey) {
    return res.status(200).json({ status: "skipped", reason: "RESEND_API_KEY missing" });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (_parseError) {
    return res.status(400).json({ message: "Invalid JSON body" });
  }

  const event = String(body?.event || "").trim();
  const payload =
    body?.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? body.payload
      : {};

  if (!ALLOWED_EVENTS.has(event)) {
    return res.status(400).json({ message: "Unknown event" });
  }

  // Trim every field so a verbose case body never balloons the email or the
  // Resend payload size limits.
  const safePayload = {};
  for (const [key, raw] of Object.entries(payload)) {
    const text = typeof raw === "string" ? raw : JSON.stringify(raw);
    safePayload[key] = text.length > 500 ? `${text.slice(0, 500)}…` : text;
  }

  const { subject, html, text } = buildEmail(event, safePayload);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject,
        text,
        html
      })
    });
    if (!response.ok) {
      const detail = await response.text();
      return res.status(502).json({
        status: "send_failed",
        upstream: detail.slice(0, 300)
      });
    }
    return res.status(200).json({ status: "sent" });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: error?.message || "Unknown error"
    });
  }
}
