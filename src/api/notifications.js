// Lightweight client helper for posting lifecycle events to the
// /api/notify/event serverless function. Callers must always invoke this
// fire-and-forget so a slow or failing notify endpoint never blocks the
// originating user flow.

const NOTIFY_PATH = "/api/notify/event";

export async function notifyEvent(event, payload = {}) {
  if (!event) return;
  try {
    await fetch(NOTIFY_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, payload })
    });
  } catch (_error) {
    // Notification failures must never affect the user flow.
  }
}
