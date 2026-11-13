// Texas Premium Office Helper
// When an agent opens (to print) or downloads a PDF on a carrier site,
// send a copy to astral_api, which keeps it only if it's an ID card,
// dec page, or COI — then files it where /view_documents can find it.

const CAPTURE_URL = "https://astraldbapi.herokuapp.com/docs/office-capture";
const RECEIPT_URL = "https://www.texaspremiumins.com/api/payments-to-process/receipt";
// No key in the code: each computer is activated once from the options page.
let OFFICE_KEY = null;

const updateBadge = () =>
  chrome.action.setBadgeText({ text: OFFICE_KEY ? "" : "OFF" });

const keyReady = chrome.storage.local.get("officeKey").then(({ officeKey }) => {
  OFFICE_KEY = officeKey || null;
  updateBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.officeKey) {
    OFFICE_KEY = changes.officeKey.newValue || null;
    updateBadge();
  }
});

// First install (or not yet activated): open the activation page
chrome.runtime.onInstalled.addListener(async () => {
  const { officeKey } = await chrome.storage.local.get("officeKey");
  if (!officeKey) chrome.runtime.openOptionsPage();
});

// Clicking the toolbar icon opens the activation page
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
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
  await keyReady;
  if (!OFFICE_KEY) return; // not activated on this computer — do nothing
  try {
    // Uses the agent's existing carrier login cookies
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return;
    const blob = await res.blob();
    if (blob.size > 10 * 1024 * 1024) return;

    const send = async (url) => {
      const form = new FormData();
      form.append("file", blob, "document.pdf");
      form.append("source", host);
      const out = await fetch(url, {
        method: "POST",
        headers: { "X-Office-Key": OFFICE_KEY },
        body: form,
      });
      return out.json().catch(() => ({ status: out.status }));
    };

    // Docs portal and receipt matcher each ignore what isn't theirs
    const [docs, receipt] = await Promise.allSettled([
      send(CAPTURE_URL),
      send(RECEIPT_URL),
    ]);
    console.log("[office-helper]", host, {
      docs: docs.value ?? docs.reason,
      receipt: receipt.value ?? receipt.reason,
    });
  } catch (err) {
    console.log("[office-helper] capture failed:", err);
  }
}