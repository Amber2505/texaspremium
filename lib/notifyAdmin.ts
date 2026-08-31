// update-progress uses RAILWAY_URL, the chat client uses SOCKET_URL — same
// server, two env names. Accept whichever is set.
const SOCKET_URL =
  process.env.NEXT_PUBLIC_RAILWAY_URL ||
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  "";

export async function notifyAdmin(payload: {
  section: "live-chat" | "messages" | "autopay" | "payment-links";
  title: string;
  body?: string;
  eventId?: string;
}) {
  if (!SOCKET_URL) return;
  try {
    await fetch(`${SOCKET_URL}/notify/admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    // Never let a notification failure break the actual transaction
    console.error("notifyAdmin failed:", e);
  }
}