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
  if (!SOCKET_URL) {
    console.error(
      "❌ notifyAdmin: no NEXT_PUBLIC_RAILWAY_URL or NEXT_PUBLIC_SOCKET_URL set — notification dropped",
      payload.section,
    );
    return;
  }

  const url = `${SOCKET_URL.replace(/\/$/, "")}/notify/admin`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(
        `❌ notifyAdmin: ${url} returned ${res.status}`,
        await res.text().catch(() => ""),
      );
      return;
    }
    console.log(`✅ notifyAdmin sent: ${payload.section} / ${payload.eventId}`);
  } catch (e) {
    console.error(`❌ notifyAdmin fetch failed to ${url}:`, e);
  }
}