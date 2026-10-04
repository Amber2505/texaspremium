// Texas Premium Office Helper
// When an agent opens (to print) or downloads a PDF on a carrier site,
// send a copy to astral_api, which keeps it only if it's an ID card,
// dec page, or COI — then files it where /view_documents can find it.

const CAPTURE_URL = "https://astraldbapi.herokuapp.com/docs/office-capture";
const OFFICE_KEY = "oNa5EntolrNhAvhdWpJuXP9NLdq1IsIz";
const SKIP_HOSTS = ["texaspremiumins.com", "astraldbapi.herokuapp.com"];
const seen = new Set(); // per browser session — avoids re-sending the same URL

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    // tabId -1 = our own fetch below; ignoring it prevents an endless loop
    if (details.tabId < 0) return;
    // POST-generated PDFs can't be safely re-requested
    if (details.method !== "GET") return;

    const contentType =
      details.responseHeaders?.find((h) => h.name.toLowerCase() === "content-type")
        ?.value || "";
    if (!contentType.toLowerCase().includes("application/pdf")) return;

    const host = new URL(details.url).hostname;
    if (SKIP_HOSTS.some((h) => host.endsWith(h))) return;
    if (seen.has(details.url)) return;
    seen.add(details.url);

    capture(details.url, host);
  },
  { urls: ["https://*/*"], types: ["main_frame", "sub_frame", "object", "other"] },
  ["responseHeaders"],
);

async function capture(url, host) {
  try {
    // Uses the agent's existing carrier login cookies
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return;
    const blob = await res.blob();
    if (blob.size > 10 * 1024 * 1024) return;

    const form = new FormData();
    form.append("file", blob, "document.pdf");
    form.append("source", host);

    const out = await fetch(CAPTURE_URL, {
      method: "POST",
      headers: { "X-Office-Key": OFFICE_KEY },
      body: form,
    });
    console.log("[office-helper]", host, await out.json());
  } catch (err) {
    console.log("[office-helper] capture failed:", err);
  }
}