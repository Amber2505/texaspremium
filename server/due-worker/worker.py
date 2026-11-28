# worker.py — Texas Premium due-date reminder cloud worker (Railway)
#
# Works exactly like one more office computer named "Cloud": it asks astral_api
# /reminders/next for a task, does it in its own Chrome, and reports back. So the
# reminders keep running with every office computer off.
#   report  -> sign in to AgencyMatrix, pull the due-date report, send the rows
#   policy  -> open the policy on the carrier site (signing in if needed),
#              send the page text; astral_api decides text / skip / review.
#              Carriers with no known lookup: an AI agent searches the policy and
#              clicks through to billing, like a person; what works is saved per
#              site and replayed with no AI.
#
# Logins come from Bitwarden (synced every hour, so changed passwords are picked
# up). Email verification codes are read from EMAIL_INTERNAL. Authenticator-app
# codes (Progressive) are requested from the admin by text + the admin page.
# AI is only used when a page can't be figured out by the normal rules; what it
# finds is saved per site and reused with no AI.

import email
import imaplib
import base64
import json
import random
import os
import re
import subprocess
import threading
import time
import traceback
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from email.utils import parsedate_to_datetime
from urllib.parse import urlparse

import requests
from playwright.sync_api import sync_playwright

ASTRAL = os.getenv("ASTRAL_API_URL", "https://astraldbapi.herokuapp.com").rstrip("/")
KEY = os.environ["OFFICE_CAPTURE_KEY"]
NAME = os.getenv("WORKER_NAME", "Cloud")
DATA = os.getenv("DATA_DIR", "/data")
PROFILE = os.path.join(DATA, "chrome-profile")
RECIPES = os.path.join(DATA, "recipes.json")
IMAP_HOST = os.getenv("EMAIL_INTERNAL_IMAP", "imap.gmail.com")
AI_MODEL = os.getenv("DUE_REMINDER_MODEL", "gpt-4o-mini")
AM_HOME = "https://agents.agencymatrix.com/"
AM_HOST = "agents.agencymatrix.com"
# The report pages agents use. The worker opens them on the live screen before pulling.
AM_DUE_PAGE = "https://agents.agencymatrix.com/#/reports/due_dates"
AM_TX_PAGE = "https://agents.agencymatrix.com/#/reports/trans_detail"
HEADERS = {"X-Office-Key": KEY}


def log(*a):
    print(datetime.now().strftime("%H:%M:%S"), *a, flush=True)


def site_domain(host):
    parts = (host or "").lower().split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else (host or "").lower()


def api(path, body):
    r = requests.post(f"{ASTRAL}{path}", json=body, headers=HEADERS, timeout=90)
    r.raise_for_status()
    return r.json()


# ---------------- Bitwarden ----------------
class Vault:
    """Reads logins with the Bitwarden CLI from the office's own vault. Signs in with
    the personal API key if set (else email + master password), unlocks with the
    master password, re-syncs hourly so changed passwords are picked up."""

    def __init__(self):
        self.items, self.loaded = None, 0.0

    def _bw(self, *args, extra=None):
        # --nointeraction: never sit waiting for a prompt; the env vars keep the CLI
        # quiet (no update notice mixed into the JSON) and pointed at our server.
        env = {**os.environ, "BITWARDENCLI_APPDATA_DIR": os.getenv("BITWARDENCLI_APPDATA_DIR", "/data/bw"),
               "BW_NOINTERACTION": "true", "NODE_NO_WARNINGS": "1", **(extra or {})}
        r = subprocess.run(["bw", *args, "--nointeraction"], capture_output=True, text=True, timeout=180, env=env)
        if r.returncode:
            msg = (r.stderr or r.stdout).strip()
            for secret in (os.getenv("BITWARDEN_PASSWORD"), os.getenv("BW_CLIENTSECRET")):
                if secret:
                    msg = msg.replace(secret, "***")
            raise RuntimeError(f"Bitwarden {args[0]} failed: {msg[:250]}")
        return r.stdout.strip()

    @staticmethod
    def _json(out, default):
        """bw sometimes prints a notice before the JSON: read from the first { or [."""
        i = min([k for k in (out.find("{"), out.find("[")) if k >= 0], default=-1)
        return json.loads(out[i:]) if i >= 0 else default

    def _login(self):
        server = os.getenv("BW_SERVER", "").strip()  # e.g. https://vault.bitwarden.eu for an EU account
        if server:
            try:
                self._bw("config", "server", server)
            except RuntimeError as e:  # "Logout required before server config update"
                log(f"[vault] {e}")
        if os.getenv("BW_CLIENTID") and os.getenv("BW_CLIENTSECRET"):
            # API key: no "new device" email code from Bitwarden
            self._bw("login", "--apikey")
        else:
            self._bw("login", os.environ["BITWARDEN_EMAIL"], "--passwordenv", "BITWARDEN_PASSWORD")

    def load(self, force=False):
        if not force and self.items is not None and time.time() - self.loaded < 3600:
            return
        if not os.getenv("BITWARDEN_PASSWORD"):
            raise RuntimeError("Bitwarden: BITWARDEN_PASSWORD (master password) isn't set on Railway")
        st = self._json(self._bw("status"), {})
        status = st.get("status")
        want = (os.getenv("BITWARDEN_EMAIL") or "").strip().lower()
        if status != "unauthenticated" and want and (st.get("userEmail") or "").lower() not in ("", want):
            log(f"[vault] signed in as {st.get('userEmail')}, switching to {want}")
            self._bw("logout")
            status = "unauthenticated"
        if status == "unauthenticated":
            self._login()
        try:
            session = self._bw("unlock", "--passwordenv", "BITWARDEN_PASSWORD", "--raw")
        except RuntimeError as e:
            if "not logged in" in str(e).lower():
                self._login()
                session = self._bw("unlock", "--passwordenv", "BITWARDEN_PASSWORD", "--raw")
            else:
                raise RuntimeError(f"{e} (check BITWARDEN_PASSWORD: it must be the master password)")
        self._bw("sync", "--session", session)
        items = self._json(self._bw("list", "items", "--session", session), [])
        self.items = [i for i in items if i.get("type") == 1 and (i.get("login") or {}).get("password")]
        self.loaded = time.time()
        no_site = sum(1 for i in self.items if not (i["login"].get("uris") or []))
        log(f"[vault] signed in as {st.get('userEmail') or want}: {len(self.items)} logins"
            + (f" ({no_site} have no website saved, matched by name)" if no_site else ""))

    def login_for(self, host):
        """Best login for this site: exact host first, then same domain."""
        if site_domain(host) == "agencymatrix.com" and os.getenv("MATRIX_LOGIN") and os.getenv("MATRIX_PASSWORD"):
            return {"user": os.environ["MATRIX_LOGIN"], "pass": os.environ["MATRIX_PASSWORD"], "item": "MATRIX_LOGIN"}
        self.load()
        host, dom = host.lower(), site_domain(host)
        best, score = None, -1.0
        for it in self.items:
            for u in (it["login"].get("uris") or []):
                raw = (u.get("uri") or "").strip()
                if not raw:
                    continue
                h = (urlparse(raw if "://" in raw else "https://" + raw).hostname or "").lower()
                s = 3.0 if h == host else 2.0 if h and site_domain(h) == dom else -1.0
                if s < 0:
                    continue
                if re.search(r"admin|texas premium", it.get("name") or "", re.I):
                    s += 0.5
                if s > score:
                    best, score = it, s
        if not best:
            # No website match: an item whose name has the site's main word
            # ("Safeway" for www.safewayxchange.com), Texas Premium / admin logins first
            core = re.sub(r"(agents?|portal|login|online|xchange|exchange|ins(urance)?|mga|group)$", "",
                          dom.split(".")[0]) or dom.split(".")[0]
            for it in self.items:
                name = re.sub(r"[^a-z0-9]", "", (it.get("name") or "").lower())
                if len(core) >= 4 and (core in name or (len(name) >= 4 and name in dom.split(".")[0])):
                    s = 1.0 + (0.5 if re.search(r"admin|texas premium", it.get("name") or "", re.I) else 0)
                    if s > score:
                        best, score = it, s
        if not best:
            return None
        return {"user": best["login"].get("username") or "", "pass": best["login"]["password"],
                "item": best.get("name")}


    def login_by_name(self, names):
        """A login whose Bitwarden name or website has a word from the carrier's name
        ("Apollo Managing General Agency" -> the item named "Apollo MGA")."""
        self.load()
        words = {w for n in names for w in re.findall(r"[a-z]{4,}", (n or "").lower())} - GENERIC_WORDS
        best, score = None, 0.0
        for it in self.items:
            uris = " ".join((u.get("uri") or "") for u in (it["login"].get("uris") or []))
            hay = ((it.get("name") or "") + " " + uris).lower()
            s = sum(1 for w in words if w in hay)
            if not s:
                continue
            if re.search(r"admin|texas premium|agent|producer|portal", hay):
                s += 0.5
            if s > score:
                best, score = it, s
        if not best:
            return None
        return {"user": best["login"].get("username") or "", "pass": best["login"]["password"],
                "item": best.get("name")}

    def site_for(self, names):
        """The carrier's agent site from Bitwarden, matched by carrier name words
        ("Kemper Insurance company" -> the Bitwarden login named/linked "kemper")."""
        self.load()
        words = {w for n in names for w in re.findall(r"[a-z]{4,}", (n or "").lower())} - GENERIC_WORDS
        if not words:
            return None
        best, score = None, 0.0
        for it in self.items:
            uris = [(u.get("uri") or "").strip() for u in (it["login"].get("uris") or [])]
            uris = [u if "://" in u else "https://" + u for u in uris if u]
            if not uris:
                continue
            hay = ((it.get("name") or "") + " " + " ".join(uris)).lower()
            s = sum(1 for w in words if w in hay)
            if not s:
                continue
            if re.search(r"agent|producer|portal", hay):
                s += 0.5
            if s > score:
                best, score = uris[0], s
        return best


GENERIC_WORDS = {"insurance", "company", "casualty", "mutual", "county", "group", "agency", "services",
                 "general", "national", "american", "texas", "lloyds", "exchange", "managing", "corporation",
                 "underwriting", "underwriters", "specialty", "personal", "lines", "auto", "automobile"}

vault = Vault()


# ---------------- Verification codes ----------------
def _email_text(msg):
    parts = []
    for p in (msg.walk() if msg.is_multipart() else [msg]):
        if p.get_content_type() in ("text/plain", "text/html"):
            try:
                parts.append(p.get_payload(decode=True).decode(p.get_content_charset() or "utf-8", "ignore"))
            except Exception:
                pass
    return re.sub(r"<[^>]+>", " ", " ".join(parts))


def _code_inboxes():
    """Every inbox a carrier may send a verification code to:
    EMAIL_INTERNAL (preinsurance2024@gmail.com / appointment@) and
    EMAIL_USER (texaspremiuminsuranceservices@gmail.com: support@, nhussain@)."""
    out = []
    for u, p in (("EMAIL_INTERNAL", "EMAIL_INTERNAL_PASS"), ("EMAIL_USER", "EMAIL_PASS")):
        user, pw = os.getenv(u), os.getenv(p)
        if user and pw and user not in [x[0] for x in out]:
            out.append((user, pw))
    return out


def _code_in_inbox(user, pw, since_ts, words):
    m = imaplib.IMAP4_SSL(IMAP_HOST)
    try:
        m.login(user, pw)
        m.select("INBOX")
        day = datetime.fromtimestamp(since_ts - 86400, timezone.utc).strftime("%d-%b-%Y")
        _, data = m.search(None, f'(SINCE "{day}")')
        for mid in reversed(data[0].split()[-30:]):
            _, raw = m.fetch(mid, "(RFC822)")
            msg = email.message_from_bytes(raw[0][1])
            try:
                sent = parsedate_to_datetime(msg.get("Date"))
                if sent.tzinfo is None:  # "-0000" dates come back without a zone: they're UTC
                    sent = sent.replace(tzinfo=timezone.utc)
                if sent.timestamp() < since_ts - 60:
                    continue
            except Exception:
                continue
            subject = str(email.header.make_header(email.header.decode_header(msg.get("Subject") or "")))
            body = _email_text(msg)
            hay = f"{msg.get('From')} {subject} {body}".lower()
            if not any(w in hay for w in words):
                continue
            hit = re.search(r"(?<![\d$.,])(\d{6})(?![\d,])", f"{subject} {body}") or \
                re.search(r"(?<![\d$.,])(\d{4,8})(?![\d,])", f"{subject} {body}")
            if hit:
                return hit.group(1)
        return None
    finally:
        try:
            m.logout()
        except Exception:
            pass


def email_code(since_ts, host, timeout=240, carrier=""):
    """Newest code this carrier emailed after since_ts, from any of our inboxes."""
    boxes = _code_inboxes()
    if not boxes:
        log("[code] no inbox set (EMAIL_INTERNAL / EMAIL_USER)")
        return None
    words = {site_domain(host).split(".")[0]} | (
        {w for w in re.findall(r"[a-z]{4,}", (carrier or "").lower())} - GENERIC_WORDS)
    end = time.time() + timeout
    while time.time() < end:
        time.sleep(6)
        for user, pw in boxes:
            try:
                code = _code_in_inbox(user, pw, since_ts, words)
            except Exception as e:
                log(f"[code] inbox check failed for {user}: {e}")
                continue
            if code:
                log(f"[code] email code for {host} found in {user}")
                return code
    log(f"[code] no code from {host} in {', '.join(u for u, _ in boxes)} after {timeout}s")
    return None


def admin_code(host, carrier):
    """Authenticator-app code: text the admin, wait for it on the admin page."""
    api("/reminders/need-code", {"computer": NAME, "host": host, "carrier": carrier})
    log(f"[code] waiting for admin to enter the {carrier} authenticator code")
    end = time.time() + 600
    while time.time() < end:
        time.sleep(8)
        try:
            r = requests.get(f"{ASTRAL}/reminders/code", params={"host": host},
                             headers=HEADERS, timeout=20).json()
            if r.get("code"):
                return r["code"]
        except Exception:
            pass
    return None


# ---------------- Page helpers (run inside the page) ----------------
MARK_JS = r"""() => {
  const vis = (el) => el && el.offsetParent !== null && !el.disabled && el.getBoundingClientRect().width > 0;
  document.querySelectorAll("[data-tp]").forEach((e) => e.removeAttribute("data-tp"));
  const inputs = [...document.querySelectorAll("input")].filter(vis);
  const textish = inputs.filter((i) => /^(text|email|tel|number|)$/i.test(i.getAttribute("type") || ""));
  const hint = (el) => [el.name, el.id, el.placeholder, el.getAttribute("aria-label"),
    el.getAttribute("autocomplete"), el.labels && el.labels[0] && el.labels[0].innerText].join(" ").toLowerCase();
  const text = (document.body && document.body.innerText || "").slice(0, 6000);
  const loginPage = /login|signin|sign-in|logon|auth|sso/i.test(location.href) || /sign in|log in|login/i.test(document.title);
  const pass = inputs.find((i) => i.type === "password");
  let user = null;
  if (pass) {
    const before = textish.filter((i) => i.compareDocumentPosition(pass) & Node.DOCUMENT_POSITION_FOLLOWING).reverse();
    user = before.find((i) => /user|login|email|account|\bid\b/.test(hint(i))) || before[0] || null;
  } else if (loginPage) {
    user = textish.find((i) => /user|login|e-?mail|account/.test(hint(i)) && !/search|polic/.test(hint(i))) || null;
  }
  const otpWords = /verification code|security code|one[- ]time|passcode|authenticat|2-step|two-step|two-factor|enter (the|your) code|code (was |has been )?sent|verify your identity/i;
  const asksCode = !pass && otpWords.test(text);
  const otp = asksCode ? (textish.find((i) => /code|otp|token|pin|verif|passcode/.test(hint(i))) ||
    (textish.length === 1 ? textish[0] : null)) : null;
  const label = (b) => (b.innerText || b.value || b.getAttribute("aria-label") || "").trim();
  const goBtn = (scope) => [...(scope || document).querySelectorAll("button, input[type=submit], input[type=button], a[role=button], a")]
    .filter(vis).find((b) => /^(log ?in|sign ?in|submit|continue|next|verify|send( code)?|ok|go)$/i.test(label(b)));
  const mark = (el, v) => el && el.setAttribute("data-tp", v);
  mark(pass, "pass"); mark(user, "user"); mark(otp, "otp");
  const anchor = pass || otp || user;
  mark(goBtn(anchor && anchor.closest("form")) || goBtn(), "go");
  const emailOpt = asksCode && !otp ? [...document.querySelectorAll("label, button, a, input[type=radio], [role=radio], li")]
    .filter(vis).find((e) => /\be-?mail\b/i.test(label(e)) && label(e).length < 80) : null;
  mark(emailOpt, "email");
  const remember = [...document.querySelectorAll("input[type=checkbox]")].filter(vis)
    .find((c) => /remember|trust|don.?t ask/i.test((c.labels && c.labels[0] && c.labels[0].innerText) || c.parentElement.innerText || ""));
  mark(remember, "remember");
  return { pass: !!pass, user: !!user, otp: !!otp, asksCode, emailOpt: !!emailOpt,
           authApp: /authenticator/i.test(text) && !/e-?mail/i.test(text.slice(0, 1500)) };
}"""

# Multi-factor sign-in: when a site offers text / call / authenticator / email, always
# pick email (the worker reads that inbox). If a code was already sent to a phone,
# use the site's "try another way" / "email instead" link to switch to email.
MFA_JS = r"""() => {
  const vis = (el) => el && el.offsetParent !== null && !el.disabled && el.getBoundingClientRect().width > 0;
  document.querySelectorAll("[data-tpm]").forEach((e) => e.removeAttribute("data-tpm"));
  const text = (document.body && document.body.innerText || "").slice(0, 5000);
  const mfa = /verification code|security code|one[- ]time|passcode|2-step|two-step|two-factor|multi-?factor|\bmfa\b|verify (it'?s|that it'?s) you|verify your identity|confirm your identity|send (me )?(a |the )?code|receive (a |the |your )?(code|passcode)|how (would|do) you (like|want) to (receive|get|verify)|choose (a |your )?(verification )?(method|option)|delivery method/i;
  if (!mfa.test(text)) return { kind: null };
  const label = (e) => ((e.labels && e.labels[0] && e.labels[0].innerText) || e.innerText || e.value ||
    e.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
  const around = (e) => label(e) + " " + ((e.closest("label, li, tr") || e.parentElement || e).innerText || "").replace(/\s+/g, " ").slice(0, 160);
  const emailRe = /\be-?mail\b|[\w.*-]+@[\w*-]+\.[\w.*]+/i;
  const phoneRe = /\b(text|sms|call|phone|voice|mobile|cell|authenticator)\b/i;
  const notIt = /forgot|change|update|edit|contact us|help|privacy|unsubscribe/i;
  // 1) a dropdown of methods
  for (const s of document.querySelectorAll("select")) {
    if (!vis(s)) continue;
    const o = [...s.options].find((x) => emailRe.test(x.text));
    if (o && [...s.options].some((x) => phoneRe.test(x.text))) {
      s.setAttribute("data-tpm", "emailsel");
      return { kind: "choice", select: o.text.trim(), how: "dropdown" };
    }
  }
  // 2) radio buttons / buttons / links / list items
  const cands = [...document.querySelectorAll("input[type=radio], [role=radio], label, button, a, li, [role=button], [role=option], [role=menuitem]")]
    .filter((e) => e.type === "radio" ? !!e.closest("label, li, div") : vis(e));
  const phoneOpt = cands.some((e) => phoneRe.test(label(e).slice(0, 80)) || (e.type === "radio" && phoneRe.test(around(e))));
  const email = cands.find((e) => {
    const l = e.type === "radio" ? around(e) : label(e);
    return l && l.length < 140 && emailRe.test(l) && !notIt.test(l) &&
      !(e.tagName === "A" && /^mailto:/i.test(e.getAttribute("href") || ""));
  });
  if (email && (phoneOpt || /send|code|verif/i.test(label(email)))) {
    const radio = email.matches("input[type=radio]") ? email
      : (email.querySelector && email.querySelector("input[type=radio]")) ||
        (email.tagName === "LABEL" && email.htmlFor && document.getElementById(email.htmlFor));
    (radio || email).setAttribute("data-tpm", "email");
    return { kind: "choice", radio: !!radio, how: label(email).slice(0, 60) };
  }
  // 3) a code box, but the code went to a phone: switch to email
  const toPhone = /(sent|texted|text message|sms|call(ed|ing)?)[^.]{0,80}(phone|number|ending|mobile|\*{2,}|x{3,}|\d{4}\b)/i.test(text) ||
                  /phone (number )?ending|authenticator app/i.test(text);
  const other = cands.find((e) => vis(e) && /e-?mail (me )?instead|use (your |my )?e-?mail|send (it |the code )?to (my |your )?e-?mail|try another (way|method)|use (a )?different (method|option|way)|other (options|ways|methods)|choose another|another way|more options|didn'?t (get|receive)/i.test(label(e).slice(0, 80)));
  if (toPhone && other) {
    other.setAttribute("data-tpm", "other");
    return { kind: "switch", how: label(other).slice(0, 60) };
  }
  return { kind: null };
}"""

# Same search logic as the extension (duedates.js)
FILL_JS = r"""([policy, inputSel, buttonSel]) => {
  const visible = (el) => el && el.offsetParent !== null && !el.disabled;
  const words = (el) => [el.placeholder, el.name, el.id, el.getAttribute("aria-label"), el.title,
    el.closest("form, table, div") && el.closest("form, table, div").innerText.slice(0, 200)].join(" ").toLowerCase();
  let input = inputSel ? document.querySelector(inputSel) : null;
  if (!visible(input)) {
    const boxes = [...document.querySelectorAll("input[type=text], input[type=search], input:not([type])")].filter(visible);
    const score = (el) => { const w = words(el);
      return (/polic/.test(w) ? 3 : 0) + (/find customer|search|quick search/.test(w) ? 2 : 0) + (/user|password|login|zip|email/.test(w) ? -5 : 0); };
    input = boxes.sort((a, b) => score(b) - score(a))[0];
    if (!input || score(input) <= 0) return { ok: false };
  }
  input.setAttribute("data-tp", "search");
  let button = buttonSel ? document.querySelector(buttonSel) : null;
  if (!visible(button)) {
    const scope = input.closest("form") || (input.closest("table, div") && input.closest("table, div").parentElement) || document;
    button = [...scope.querySelectorAll("button, input[type=submit], input[type=button], input[type=image], a")].filter(visible)
      .find((b) => /^(search|go|find|submit)$/i.test((b.innerText || b.value || b.title || b.getAttribute("aria-label") || "").trim()));
  }
  if (button) button.setAttribute("data-tp", "searchgo");
  return { ok: true, button: !!button };
}"""

OPEN_JS = r"""(policy) => {
  const norm = (s) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const text = document.body && document.body.innerText || "";
  if (/amount due|next amount due|amount outstanding|payment due|current due/i.test(text)) return false;
  const link = [...document.querySelectorAll("a")].find((a) => a.offsetParent !== null && norm(a.innerText).includes(norm(policy)));
  if (!link) return false;
  link.removeAttribute("target");
  link.click();
  return true;
}"""

LIST_JS = r"""() => {
  const vis = (el) => el && el.offsetParent !== null && !el.disabled;
  const els = [...document.querySelectorAll("input, button, a, [role=button]")].filter(vis).slice(0, 150);
  return els.map((e, i) => ({ i, tag: e.tagName.toLowerCase(), type: e.type || "", id: e.id || "",
    name: e.getAttribute("name") || "", placeholder: e.placeholder || "",
    text: (e.innerText || e.value || e.getAttribute("aria-label") || e.title || "").trim().slice(0, 40) }));
}"""

REPORT_JS = r"""async (day) => {
  const form = new URLSearchParams({ territory: "21889", division: "23094", region: "22632", district: "69830",
    "office[]": "0", customerType: "0", customerSubType: "0", sdate: day, sdateDateRange: "Date Range", edate: day,
    orderBy: "DayDue|Day Due", language: "Any|Any", saveReportFrequency: "None", saveReportReportType: "HTML-Link" });
  const res = await fetch("https://agents.agencymatrix.com/rptDueDate2.php?Action=Run", { method: "POST",
    credentials: "include", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  const html = await res.text();
  if (res.ok && html.includes("Policy Due Dates") && /id=["']?sortable/.test(html)) return { ok: true, html };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const text = (doc.body ? doc.body.textContent : html).replace(/\s+/g, " ").trim();
  // No policies due that day is a real answer, not a failure
  if (res.ok && html.includes("Policy Due Dates") && /no (records|results|policies)|nothing to report/i.test(text))
    return { ok: true, html: "" };
  return { ok: false, error: res.ok ? "unexpected page" : `HTTP ${res.status}`, sample: text.slice(0, 300) };
}"""


# ---------------- Live view: the admin page watches this browser ----------------
class Stopped(BaseException):
    """Admin pressed Stop task. BaseException so no 'except Exception' swallows it."""


class TakeOver(BaseException):
    """Admin pressed Take control."""


class SiteDown(BaseException):
    """The carrier site is down / in its nightly maintenance: try other carriers."""


DOWN_RE = re.compile(
    r"scheduled maintenance|under maintenance|maintenance (window|mode|in progress)|"
    r"temporarily (unavailable|down)|currently (unavailable|down|offline)|"
    r"system (is )?(currently |temporarily )?(unavailable|down|offline)|"
    r"(site|service|application|portal) (is )?(currently |temporarily )?(unavailable|down|offline)|"
    r"outside (of )?(our |normal |regular )?(business|system|service|operating) hours|"
    r"(available|back) (again )?(from|between|at|after) \d|"
    r"bad gateway|service unavailable|gateway time-?out", re.I)


def check_down(page):
    """Raise SiteDown if the page is a maintenance / outage page. Only short pages
    count, so a normal portal page that mentions 'maintenance' somewhere doesn't."""
    try:
        text = page.evaluate("() => (document.body && document.body.innerText || '').slice(0, 4000)") or ""
    except Exception:
        return
    if len(text.strip()) < 2500 and DOWN_RE.search(text):
        site = site_domain(urlparse(page.url).hostname or "")
        line = DOWN_RE.search(text).group(0)
        raise SiteDown(f"{site} is down for now ('{line}')")


def open_site(page, url):
    """page.goto that turns 'site down' into SiteDown instead of a review card."""
    site = site_domain(urlparse(url).hostname or "")
    try:
        resp = page.goto(url, wait_until="domcontentloaded", timeout=45000)
    except Exception as e:
        msg = str(e).split("\n")[0]
        if "net::ERR" in msg or "Timeout" in msg:
            raise SiteDown(f"{site} isn't loading ({msg[:80]})")
        raise
    if resp is not None and resp.status >= 500:
        raise SiteDown(f"{site} returned error {resp.status}")
    settle(page)
    check_down(page)


LIVE_EVERY = float(os.getenv("DUE_LIVE_EVERY_SEC", "1"))


class Live:
    def __init__(self):
        self.task, self.status, self.last, self.watching = None, "Starting", 0.0, False
        self.paused = False  # True while a person is driving (help mode) or a report runs
        self.hold = False    # admin pressed Pause: finish nothing new until Resume
        self.defer, self.pending = False, None  # hold a Take control until the AI's step is recorded

    def start(self, task, status):
        self.task, self.last, self.paused, self.defer, self.pending = task, 0.0, False, False, None
        self.status = status
        log(f"[live] {status}")

    def say(self, status, page=None):
        self.status = status[:200]
        log(f"[live] {self.status}")
        if page is not None:
            self.tick(page, force=True)

    def tick(self, page=None, force=False):
        if not force and time.time() - self.last < LIVE_EVERY:
            return
        self.last = time.time()
        t = self.task or {}
        names = t.get("names") or []
        body = {"computer": NAME, "id": t.get("id", ""), "carrier": names[0] if names else "",
                "policy": t.get("policy") or (t.get("search") or {}).get("policy") or "",
                "note": self.status, "url": "", "screenshot": ""}
        if page is not None:
            try:
                body["url"] = page.url
            except Exception:
                pass
            # Every 2s while someone watches, and at least every 10s otherwise,
            # so the admin page never shows an empty box during a check
            if not self.paused and t.get("id") and (
                    self.watching or time.time() - getattr(self, "last_shot", 0) >= 10):
                body["screenshot"] = _shot(page)
                self.last_shot = time.time()
        try:
            r = api("/reminders/live", body)
        except Exception:
            return  # astral not updated yet / network blip: never break a check over this
        was = self.watching
        self.watching = bool(r.get("watching"))
        if self.watching and not was:
            self.last = 0.0  # someone just opened the page: send a screenshot right away
        self.hold = bool(r.get("paused"))
        control = r.get("control") or (None if self.defer else self.pending)
        if self.paused or not t.get("id"):
            return
        if self.defer:
            self.pending = control or self.pending
            return
        self.pending = None
        if control == "stop":
            raise Stopped()
        if control == "take":
            raise TakeOver()

    def idle(self, status="Idle"):
        self.task, self.status, self.paused = None, status, False
        self.tick(force=True)


live = Live()


# The agency is licensed only in Texas: a blank state dropdown is always Texas.
# Only blank ones ("Select...", "--", empty), never a state that's already filled in.
TEXAS_JS = r"""() => {
  const picked = [];
  for (const s of document.querySelectorAll("select")) {
    if (s.disabled || s.offsetParent === null) continue;
    const opts = [...s.options];
    const tx = opts.find((o) => /^(texas|tx)$/i.test(o.text.trim()) || /^(texas|tx)$/i.test((o.value || "").trim()));
    if (!tx || s.value === tx.value) continue;
    const label = ((s.labels && s.labels[0] && s.labels[0].innerText) || s.getAttribute("aria-label") || s.name || s.id || "").trim();
    if (!/state/i.test(label) && opts.length < 40) continue;
    const cur = s.selectedIndex >= 0 ? opts[s.selectedIndex] : null;
    const blank = !cur || !s.value || /^(-+|select.*|choose.*|please.*|state)$/i.test(cur.text.trim());
    // On a sign-in form the state is the agency's, so it's always Texas (Safeway starts on California)
    const login = (s.form ? !!s.form.querySelector("input[type=password]")
                          : /^(agent |agency )?state$/i.test(label) && !!document.querySelector("input[type=password]"));
    if (!blank && !login) continue;
    s.value = tx.value;
    s.dispatchEvent(new Event("input", { bubbles: true }));
    s.dispatchEvent(new Event("change", { bubbles: true }));
    picked.push(label.slice(0, 40) || "state");
  }
  return picked;
}"""


def pick_texas(page):
    try:
        picked = page.evaluate(TEXAS_JS)
    except Exception:
        return
    if picked:
        log(f"[texas] picked Texas in: {', '.join(picked)}")


def settle(page, ms=4000):
    try:
        page.wait_for_load_state("domcontentloaded", timeout=30000)
    except Exception:
        pass
    # Stop waiting as soon as the page has gone quiet (most pages: well under a second)
    end = time.time() + ms / 1000
    try:
        page.wait_for_load_state("networkidle", timeout=min(ms, 3000))
        end = min(end, time.time() + 0.4)
    except Exception:
        pass
    pick_texas(page)
    # Wait in small slices so the live view stays fresh and Stop/Take control react fast
    while True:
        live.tick(page)
        left = end - time.time()
        if left <= 0:
            break
        page.wait_for_timeout(int(min(left, LIVE_EVERY) * 1000))


def click_or_enter(page, sel, field_sel):
    if page.locator(sel).count():
        page.locator(sel).first.click()
    elif field_sel and page.locator(field_sel).count():
        page.locator(field_sel).first.press("Enter")


def read_page(page):
    try:
        return {"text": page.evaluate("() => (document.body && document.body.innerText || '').slice(0, 15000)"),
                "finalUrl": page.url, "title": page.title()}
    except Exception as e:
        return {"text": "", "finalUrl": page.url, "title": "", "error": str(e)[:200]}


# ---------------- Saved per-site steps (only AI writes these) ----------------
def recipes():
    try:
        with open(RECIPES) as f:
            return json.load(f)
    except Exception:
        return {}


def save_recipe(host, key, value):
    r = recipes()
    r.setdefault(host, {})[key] = value
    os.makedirs(DATA, exist_ok=True)
    with open(RECIPES, "w") as f:
        json.dump(r, f, indent=1)


def selector_for(el):
    for attr in ("id", "name", "placeholder"):
        if el.get(attr):
            v = el[attr].replace('"', '\\"')
            return f'{el["tag"]}[{attr}="{v}"]'
    return None


def ai_pick_search(page, host):
    """One AI call: which box searches by policy number and which button runs it.
    Saved for this site, so it isn't asked again unless the site changes."""
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return None
    els = page.evaluate(LIST_JS)
    prompt = ("These are the visible inputs and buttons on an insurance agent portal page. Which input is the box "
              "to search for a policy by POLICY NUMBER, and which element runs that search? "
              'Answer JSON only: {"input": index|null, "button": index|null}\n\n' + json.dumps(els))
    try:
        r = requests.post("https://api.openai.com/v1/chat/completions",
                          headers={"Authorization": f"Bearer {key}"}, timeout=60,
                          json={"model": AI_MODEL, "temperature": 0, "response_format": {"type": "json_object"},
                                "messages": [{"role": "user", "content": prompt}]})
        r.raise_for_status()
        pick = json.loads(r.json()["choices"][0]["message"]["content"])
    except Exception as e:
        log(f"[ai] search pick failed: {e}")
        return None
    by_i = {e["i"]: e for e in els}
    inp = by_i.get(pick.get("input")) if isinstance(pick.get("input"), int) else None
    btn = by_i.get(pick.get("button")) if isinstance(pick.get("button"), int) else None
    found = {"input": selector_for(inp) if inp else None, "button": selector_for(btn) if btn else None}
    if found["input"]:
        save_recipe(host, "search", found)
        log(f"[ai] learned the policy search on {host}: {found}")
        return found
    return None


# ---------------- Signing in ----------------
def _login_frame(page):
    """The page or iframe that holds the sign-in form (some carriers put it in an iframe)."""
    st = page.evaluate(MARK_JS)
    if st["pass"] or st["user"] or st["otp"] or st["asksCode"]:
        return page, st
    for fr in page.frames[1:]:
        try:
            fst = fr.evaluate(MARK_JS)
        except Exception:
            continue
        if fst["pass"] or fst["user"] or fst["otp"]:
            return fr, fst
    return page, st


def _wait_signed_in(page, frame, timeout=12000):
    """After pressing Sign in: wait until the password box is gone (or the page moved on)."""
    url = page.url
    end = time.time() + timeout / 1000
    while time.time() < end:
        page.wait_for_timeout(500)
        live.tick(page)
        try:
            if page.url != url or not frame.evaluate(
                    "() => [...document.querySelectorAll('input[type=password]')].some((i) => i.offsetParent !== null)"):
                break
        except Exception:
            break  # the frame went away: the page moved on
    settle(page, 3000)


def _find_cred(host, home_host, carrier):
    """Bitwarden login for this sign-in page: its own site, then the carrier's portal
    site (sign-in often happens on a different address), then the carrier's name."""
    for h in (host, home_host):
        if h:
            cred = vault.login_for(h)
            if cred:
                return cred
    return vault.login_by_name([carrier]) if carrier else None


def _mfa(fr):
    try:
        return fr.evaluate(MFA_JS)
    except Exception:
        return {"kind": None}


def sign_in_if_needed(page, host, carrier, home_host=None):
    """Handles login forms (also username-first and iframe ones), 'send code by email'
    choices and code boxes. Returns (error_or_None, signed_in_now)."""
    did, code_sent_at, pass_tries, user_only, switched = False, None, 0, 0, 0
    for _ in range(8):
        fr, st = _login_frame(page)
        login_host = (urlparse(page.url).hostname or host or "").lower()
        if st["pass"] or st["user"]:
            try:
                cred = _find_cred(login_host, home_host or host, carrier)
            except Exception as e:
                log(f"[vault] {e}")
                return str(e)[:200], did
            if not cred:
                log(f"[login] no Bitwarden login matches {login_host} / {home_host or host} / {carrier}")
                return (f"No Bitwarden login found for {site_domain(login_host)} ({carrier}). Add the login "
                        f"in Bitwarden with that website, or name it after the carrier"), did
            if st["pass"] and pass_tries >= 2:
                return f"Sign-in to {site_domain(login_host)} was rejected (check the password in Bitwarden: {cred['item']})", did
            if st["user"] and not st["pass"]:
                user_only += 1
                if user_only > 2:
                    return f"Sign-in to {site_domain(login_host)} won't take the username ({cred['item']})", did
            if st["user"]:
                fr.locator("[data-tp=user]").first.fill(cred["user"])
            if st["pass"]:
                fr.locator("[data-tp=pass]").first.fill(cred["pass"])
                pass_tries += 1
            if fr.locator("[data-tp=remember]").count():
                try:
                    fr.locator("[data-tp=remember]").first.check()
                except Exception:
                    pass
            click_or_enter(fr, "[data-tp=go]", "[data-tp=pass]" if st["pass"] else "[data-tp=user]")
            did = True
            log(f"[login] {login_host} with Bitwarden '{cred['item']}'" + ("" if st["pass"] else " (username first)"))
            if st["pass"]:
                _wait_signed_in(page, fr)
                continue
        elif not code_sent_at and (m := _mfa(fr))["kind"] == "choice":
            # Text / call / authenticator / email: always email
            try:
                if m.get("select"):
                    fr.locator("[data-tpm=emailsel]").first.select_option(label=m["select"])
                elif m.get("radio"):
                    fr.locator("[data-tpm=email]").first.check(force=True)
                else:
                    fr.locator("[data-tpm=email]").first.click()
            except Exception as e:
                log(f"[code] couldn't pick email on {login_host}: {e}")
                return f"{carrier}: couldn't choose email for the verification code", did
            sent_at = time.time() - 5
            page.wait_for_timeout(1200)
            again = fr.evaluate(MARK_JS)  # clicking "Email me" often sends it right away
            if not again["otp"] and fr.locator("[data-tp=go]").count():
                click_or_enter(fr, "[data-tp=go]", None)
            code_sent_at = sent_at
            did = True
            log(f"[code] picked email for the code on {login_host} ({m.get('how')})")
        elif not code_sent_at and switched < 2 and m["kind"] == "switch":
            fr.locator("[data-tpm=other]").first.click()
            switched += 1
            log(f"[code] the code went to a phone on {login_host}: switching to email ({m.get('how')})")
        elif st["otp"]:
            if st["authApp"] and not code_sent_at:
                code = admin_code(login_host, carrier)
            else:
                code = email_code(code_sent_at or time.time() - 180, login_host, carrier=carrier)
            if not code:
                return f"{carrier}: verification code never arrived", did
            fr.evaluate(MARK_JS)
            fr.locator("[data-tp=otp]").first.fill(code)
            if fr.locator("[data-tp=remember]").count():
                try:
                    fr.locator("[data-tp=remember]").first.check()
                except Exception:
                    pass
            click_or_enter(fr, "[data-tp=go]", "[data-tp=otp]")
            did = True
            _wait_signed_in(page, fr)
            continue
        else:
            return None, did
        settle(page, 3000)
    return f"Still on the sign-in page for {site_domain(urlparse(page.url).hostname or host)}", did


# ---------------- AI agent (finds a policy on a site with no known lookup) ----------------
# Like a person would: search the policy number, open it, click to the billing page.
# What worked is saved per site and replayed with no AI; AI only runs again when
# the saved steps stop working.
OBSERVE_JS = r"""() => {
  const vis = (el) => el && el.offsetParent !== null && !el.disabled && el.getBoundingClientRect().width > 0;
  document.querySelectorAll("[data-tpi]").forEach((e) => e.removeAttribute("data-tpi"));
  const els = [...document.querySelectorAll("input, button, select, textarea, a, [role=button], [role=tab], [role=link], [onclick]")]
    .filter(vis).filter((e) => !(e.tagName === "INPUT" && /^(hidden|password)$/i.test(e.type || ""))).slice(0, 140);
  const out = els.map((e, i) => {
    e.setAttribute("data-tpi", String(i));
    const sel = e.tagName === "SELECT";
    return { i, tag: e.tagName.toLowerCase(), type: sel ? "" : (e.type || ""), id: e.id || "", name: e.getAttribute("name") || "",
      placeholder: e.placeholder || "", aria: e.getAttribute("aria-label") || (e.labels && e.labels[0] ? e.labels[0].innerText.trim().slice(0, 40) : ""),
      text: sel ? "" : (e.innerText || e.value || e.title || "").trim().replace(/\s+/g, " ").slice(0, 50),
      options: sel ? [...e.options].map((o) => o.text.trim()).filter(Boolean).slice(0, 30) : undefined,
      selected: sel && e.selectedIndex >= 0 ? (e.options[e.selectedIndex].text || "").trim() : undefined };
  });
  return { url: location.href, title: document.title, elements: out,
           text: (document.body && document.body.innerText || "").replace(/\s+\n/g, "\n").slice(0, 2500) };
}"""

POLICY_PAGE_JS = r"""(policy) => {
  const norm = (s) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const text = document.body && document.body.innerText || "";
  return norm(text).includes(norm(policy)) &&
    /amount due|next amount due|payment due|next due|due date|amount outstanding|current due|minimum due|balance due/i.test(text);
}"""

FIND_JS = r"""(d) => {
  const vis = (el) => el && el.offsetParent !== null && !el.disabled;
  document.querySelectorAll("[data-tp=r]").forEach((e) => e.removeAttribute("data-tp"));
  let el = null;
  if (d.id && !/\d{5,}/.test(d.id)) el = document.getElementById(d.id);
  if (!vis(el) && d.name) el = document.querySelector(`${d.tag}[name="${CSS.escape(d.name)}"]`);
  if (!vis(el) && d.placeholder) el = document.querySelector(`${d.tag}[placeholder="${CSS.escape(d.placeholder)}"]`);
  const norm = (s) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!vis(el) && d.text === "{policy}" && d.policy) el = [...document.querySelectorAll(d.tag || "a")].find((e) => vis(e) &&
    norm(e.innerText || e.value).includes(norm(d.policy))) || null;
  else if (!vis(el) && d.text) el = [...document.querySelectorAll(d.tag || "*")].find((e) => vis(e) &&
    (e.innerText || e.value || e.title || "").trim().replace(/\s+/g, " ").slice(0, 50) === d.text) || null;
  if (!vis(el)) return false;
  el.setAttribute("data-tp", "r");
  return true;
}"""


def ai_next_action(policy, names, obs, history):
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        return {"action": "fail", "reason": "OPENAI_API_KEY not set"}
    els = "\n".join(
        f'[{e["i"]}] {e["tag"]}{("/" + e["type"]) if e["type"] else ""} '
        f'{e["text"] or e["placeholder"] or e["aria"] or e["name"] or e["id"]!r}'
        + (f' dropdown, now {e.get("selected")!r}, options: {e["options"]}' if e.get("options") is not None else "")
        for e in obs["elements"])
    prompt = (
        "You operate an insurance AGENT portal in a web browser. Goal: open policy number "
        f"{policy} (carrier: {', '.join(names)}) and get to the page that shows that policy's billing: "
        "amount due and next payment due date. Sign-in is already handled for you.\n"
        "Pick ONE next action. Answer JSON only, one of:\n"
        '{"action":"click","i":N}\n'
        '{"action":"type","i":N,"text":"...","enter":true|false}\n'
        '{"action":"select","i":N,"option":"exact option text"}   (for a dropdown)\n'
        '{"action":"goto","url":"https://..."}\n'
        '{"action":"back"}\n'
        '{"action":"done"}   (this page shows the policy\'s amount due / due date)\n'
        '{"action":"fail","reason":"..."}  (policy not found, or the site can\'t do it)\n'
        "Tips: use the policy search box (often 'Policy #', 'Find', 'Quick Search', 'Search'); "
        "open the matching policy from the results; billing is often under a 'Billing', 'Payments' "
        "or 'Account' tab. Never type passwords. Don't repeat an action that didn't change anything. "
        "The agency is licensed only in Texas: whenever a page asks for a state, choose Texas (TX).\n\n"
        f"Your previous actions:\n{chr(10).join(history[-8:]) or '(none)'}\n\n"
        f"URL: {obs['url']}\nTitle: {obs['title']}\n\nPage text (start):\n{obs['text']}\n\n"
        f"Clickable / typeable elements:\n{els}"
    )
    try:
        r = requests.post("https://api.openai.com/v1/chat/completions",
                          headers={"Authorization": f"Bearer {key}"}, timeout=60,
                          json={"model": os.getenv("DUE_AGENT_MODEL", AI_MODEL), "temperature": 0,
                                "response_format": {"type": "json_object"},
                                "messages": [{"role": "user", "content": prompt}]})
        r.raise_for_status()
        return json.loads(r.json()["choices"][0]["message"]["content"])
    except Exception as e:
        return {"action": "fail", "reason": f"AI error: {e}"[:200]}


def _ai_wait(page, fn, *args):
    """Run an AI call in the background and keep the live view / Take control
    responsive while it thinks (nothing has been done on the page yet, so a
    Take control here loses nothing)."""
    box = {}
    th = threading.Thread(target=lambda: box.setdefault("r", fn(*args)), daemon=True)
    th.start()
    deferred, live.defer = live.defer, False
    try:
        while th.is_alive():
            live.tick(page)
            th.join(0.3)
    finally:
        live.defer = deferred
    return box.get("r") or {"action": "fail", "reason": "AI gave no answer"}


def _desc(e):
    return {k: e[k] for k in ("tag", "id", "name", "placeholder", "text")}


def _do_step(ctx, page, step, policy):
    """Run one saved/AI step. Returns the page now in front (a click may open a new tab)."""
    before = len(ctx.pages)
    if step["do"] == "goto":
        page.goto(step["url"], wait_until="domcontentloaded", timeout=45000)
    elif step["do"] == "back":
        page.go_back(wait_until="domcontentloaded", timeout=30000)
    else:
        if not page.evaluate(FIND_JS, {**step["target"], "policy": policy}):
            raise RuntimeError(f"step target not found: {step['target']}")
        loc = page.locator("[data-tp=r]").first
        if step["do"] == "select":
            loc.select_option(label=step["option"])
        elif step["do"] == "type":
            loc.fill(step["text"].replace("{policy}", policy))
            if step.get("enter"):
                loc.press("Enter")
        else:
            loc.click()
    settle(page, 3000)
    if len(ctx.pages) > before:
        newest = ctx.pages[-1]
        settle(newest, 3000)
        return newest
    return page


def _on_policy_page(page, policy):
    try:
        return bool(page.evaluate(POLICY_PAGE_JS, policy))
    except Exception:
        return False


BILLING_RE = re.compile(r"amount due|next amount due|payment due|next due|due date|amount outstanding|"
                        r"current due|minimum due|balance due", re.I)


def shows_billing(result, policy):
    text = result.get("text") or ""
    return bool(policy) and _norm_js(policy) in _norm_js(text) and bool(BILLING_RE.search(text))


SIGNIN_TROUBLE = re.compile(r"bitwarden|rejected|code|authenticator", re.I)


# ---------------- "Ask Amber" help mode ----------------
# When the AI is stuck (sign-in it can't finish, policy it can't find, site it
# doesn't know), the worker pauses, texts the admin, and shows the live browser
# on the Due-date Reminders page. Clicks and typing there drive this browser; the
# steps are saved per site so next time no help (and no AI) is needed.
HELP_WAIT_MIN = int(os.getenv("DUE_HELP_WAIT_MIN", "10"))
HELP_KEYS = {"Enter", "Tab", "Escape", "Backspace", "Delete", "ArrowDown", "ArrowUp", "ArrowLeft",
             "ArrowRight", "Home", "End", "PageUp", "PageDown", "Space"}
_help_snooze_until = 0.0

POINT_JS = r"""([x, y]) => {
  let el = document.elementFromPoint(x, y);
  if (!el) return null;
  el = el.closest("a, button, input, select, textarea, label, [role=button], [role=tab], [role=link], [role=menuitem], [onclick], tr, li");
  if (!el) return null;  // clicked empty space: do it, but don't save it as a step
  const sel = el.tagName === "SELECT";
  return { tag: el.tagName.toLowerCase(), id: el.id || "", name: el.getAttribute("name") || "",
    placeholder: el.placeholder || "",
    text: sel ? "" : (el.innerText || el.value || el.title || "").trim().replace(/\s+/g, " ").slice(0, 50),
    options: sel ? [...el.options].map((o) => o.text.trim()).filter(Boolean).slice(0, 60) : null,
    label: sel ? ((el.labels && el.labels[0] && el.labels[0].innerText.trim()) || el.getAttribute("aria-label") || el.name || "").slice(0, 60) : "" };
}"""

FOCUS_JS = r"""() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  return { tag: el.tagName.toLowerCase(), id: el.id || "", name: el.getAttribute("name") || "",
    placeholder: el.placeholder || "", text: "", secret: (el.type || "").toLowerCase() === "password" };
}"""


def _shot(page):
    try:
        return base64.b64encode(page.screenshot(type="jpeg", quality=40)).decode()
    except Exception:
        return ""


def ask_for_help(ctx, page, task, question, forced=False):
    """Returns (result, page, steps). result: done | skip | timeout | snoozed.
    forced: the admin pressed Take control (no snooze, no text message)."""
    global _help_snooze_until
    if not forced and time.time() < _help_snooze_until:
        return "snoozed", page, []
    if not forced and page.url.startswith("http"):
        check_down(page)  # a site in maintenance isn't something you can help with
    live.paused = True
    live.say(("Your turn: " if forced else "Waiting for your help: ") + question[:150], page)
    try:
        return _help_loop(ctx, page, task, question, forced)
    finally:
        live.paused = False
        live.say("Back to work", None)


def _help_loop(ctx, page, task, question, forced):
    global _help_snooze_until
    hid = task["id"]
    policy = task.get("policy") or ""
    names = task.get("names") or []
    log(f"[help] asking for help: {question}")
    api("/reminders/help/open", {"id": hid, "computer": NAME, "carrier": names[0] if names else "",
                                 "policy": policy, "question": question, "url": page.url,
                                 "screenshot": _shot(page), "quiet": forced})
    steps, deadline, last_frame = [], time.time() + HELP_WAIT_MIN * 60, time.time()
    choose = None  # a dropdown the admin clicked: its options, shown on the admin page
    while time.time() < deadline:
        acts = api("/reminders/help/take", {"id": hid}).get("actions") or []
        for a in acts:
            deadline = max(deadline, time.time() + HELP_WAIT_MIN * 60)  # someone is helping
            t = a.get("type")
            if t == "down":  # admin looked and says the site is down
                api("/reminders/help/close", {"id": hid, "status": "down"})
                log("[help] admin says the site is down")
                raise SiteDown(f"{site_domain(urlparse(page.url).hostname or '')} marked down from the admin page")
            if t in ("done", "skip", "resume"):  # resume = "Let AI continue" from here
                api("/reminders/help/close", {"id": hid, "status": t})
                log(f"[help] {t} ({len(steps)} steps)")
                return t, page, steps
            try:
                if t == "click":
                    x, y = float(a["x"]), float(a["y"])
                    desc = page.evaluate(POINT_JS, [x, y])
                    if desc and desc.get("options") is not None:
                        # A dropdown's list is drawn outside the page, so it never shows in the
                        # screenshot: send its options to the admin page to pick from instead
                        choose = {"x": x, "y": y, "label": desc.get("label") or "", "options": desc["options"]}
                        last_frame = 0
                        continue
                    if desc:
                        desc.pop("options", None)
                        desc.pop("label", None)
                    before = len(ctx.pages)
                    page.mouse.move(x - 3, y - 2)
                    page.mouse.click(x, y, delay=random.randint(30, 70))
                    if desc and (desc["id"] or desc["name"] or desc["placeholder"] or desc["text"]):
                        st = {"do": "click", "target": desc}
                        if policy and _norm_js(policy) in _norm_js(desc["text"]):
                            st["target"] = {**desc, "id": "", "text": "{policy}"}
                        steps.append(st)
                    settle(page, 2000)
                    if len(ctx.pages) > before:
                        page = ctx.pages[-1]
                        settle(page, 2000)
                elif t == "select":
                    x, y, value = float(a["x"]), float(a["y"]), str(a.get("value") or "")
                    desc = page.evaluate(POINT_JS, [x, y])
                    page.evaluate("""([x, y]) => { document.querySelectorAll("[data-tps]").forEach((e) => e.removeAttribute("data-tps"));
                        const el = document.elementFromPoint(x, y); const s = el && el.closest("select"); if (s) s.setAttribute("data-tps", "1"); }""", [x, y])
                    page.locator("[data-tps]").first.select_option(label=value)
                    choose = None
                    if desc:
                        desc.pop("options", None)
                        desc.pop("label", None)
                        steps.append({"do": "select", "target": desc, "option": value})
                    settle(page, 2500)
                elif t == "type":
                    text = str(a.get("text") or "")
                    focused = page.evaluate(FOCUS_JS)
                    page.keyboard.type(text, delay=random.randint(15, 40))
                    if focused and not focused.pop("secret", False):
                        prev = steps[-1] if steps and steps[-1]["do"] == "type" and steps[-1]["target"] == focused else None
                        full = (prev["text"] if prev and prev["text"] != "{policy}" else (policy if prev else "")) + text
                        st = {"do": "type", "target": focused,
                              "text": "{policy}" if policy and _norm_js(full) == _norm_js(policy) else full}
                        if prev:
                            steps[-1] = st
                        else:
                            steps.append(st)
                elif t == "key" and a.get("key") in HELP_KEYS:
                    page.keyboard.press(a["key"])
                    if a["key"] == "Enter" and steps and steps[-1]["do"] == "type":
                        steps[-1]["enter"] = True
                    if a["key"] == "Backspace" and steps and steps[-1]["do"] == "type" and steps[-1]["text"] != "{policy}":
                        steps[-1]["text"] = steps[-1]["text"][:-1]
                    if a["key"] == "Enter":
                        settle(page, 2000)
                elif t == "goto" and str(a.get("url") or "").startswith("http"):
                    page.goto(a["url"], wait_until="domcontentloaded", timeout=45000)
                    steps.append({"do": "goto", "url": a["url"]})
                    settle(page)
                elif t == "scroll":
                    if a.get("x") is not None and a.get("y") is not None:
                        page.mouse.move(float(a["x"]), float(a["y"]))  # scroll the part under the mouse
                    page.mouse.wheel(0, max(-3000.0, min(3000.0, float(a.get("dy") or 500))))
                    time.sleep(0.15)
                elif t == "back":
                    page.go_back(wait_until="domcontentloaded", timeout=30000)
                    steps.append({"do": "back"})
                    settle(page)
            except Exception as e:
                log(f"[help] action {t} failed: {e}")
        if acts or time.time() - last_frame > 1.2:
            try:
                title = page.title()
            except Exception:
                title = ""
            api("/reminders/help/frame", {"id": hid, "url": page.url, "title": title, "screenshot": _shot(page),
                                          "select": choose})
            last_frame = time.time()
        time.sleep(0.25)
    api("/reminders/help/close", {"id": hid, "status": "timeout"})
    if forced:
        return "timeout", page, steps
    _help_snooze_until = time.time() + 60 * 60
    log("[help] nobody answered; won't ask again for an hour")
    return "timeout", page, steps


def _portal_memory(names):
    return (recipes().get("_portals") or {}).get(_norm_js(names[0])) if names else None


def _remember_portal(names, url):
    if names and url.startswith("http"):
        portals = dict(recipes().get("_portals") or {})
        portals[_norm_js(names[0])] = url
        data = recipes()
        data["_portals"] = portals
        with open(RECIPES, "w") as f:
            json.dump(data, f, indent=1)


def run_agent(ctx, page, task, recipe_key="agent"):
    policy, names = task["policy"], task.get("names") or []
    carrier = names[0] if names else "this carrier"
    start = task.get("portal") or _portal_memory(names) or vault.site_for(names)
    helped = False

    if not start:
        page.goto("about:blank")
        res, page2, hsteps = ask_for_help(
            ctx, page, task, f"I don't know {carrier}'s agent website. Use 'Go to' to open it, "
                             f"sign in if needed, open policy {policy}'s billing page, then press Done.")
        if res not in ("done", "resume"):
            return {"error": f"No website known for {carrier} (save its login in Bitwarden, or help when asked)",
                    "text": ""}
        first_goto = next((s["url"] for s in hsteps if s["do"] == "goto"), page2.url)
        _remember_portal(names, first_goto)
        if res == "done":
            out = read_page(page2)
            if page2 is not page:
                page2.close()
            return out
        start = first_goto  # "Let AI continue": the AI takes it from this site

    host = (urlparse(start).hostname or "").lower()
    site = site_domain(host)

    if task.get("here"):
        # You just handed it back: carry on from this exact page (no reload, no saved steps)
        saved = None
        home = page.url
        err = None
        live.say(f"AI continues from your page for policy {policy}", page)
    else:
        live.say(f"Opening {site} for policy {policy}", page)
        open_site(page, start)
        err, _ = sign_in_if_needed(page, host, carrier, home_host=host)
        check_down(page)
    if err:
        res, page, _ = ask_for_help(ctx, page, task, f"{err}. Please sign in on the screen "
                                                     f"(or fix it in Bitwarden and press Skip), then press "
                                                     f"Let AI continue.")
        if res not in ("done", "resume"):
            return {"error": err, **read_page(page)}
        helped = True
    if not task.get("here"):
        home = page.url
        saved = recipes().get(site, {}).get(recipe_key)

    # 1) Saved steps for this site: no AI
    if saved:
        live.say(f"Following the {len(saved)} saved steps for {site}", page)
        try:
            cur = page
            for step in saved:
                cur = _do_step(ctx, cur, step, policy)
            if _on_policy_page(cur, policy):
                log(f"[agent] {site}: saved steps worked")
                out = read_page(cur)
                if cur is not page:
                    cur.close()
                return out
            if cur is not page:
                cur.close()
        except Exception as e:
            log(f"[agent] {site}: saved steps failed ({e}), asking AI")
        page.goto(home, wait_until="domcontentloaded", timeout=45000)
        settle(page)

    # 2) AI drives the site, one action at a time; a person helps when it's stuck
    cur, history, steps = page, [], []
    for _round in range(int(os.getenv("DUE_AGENT_ROUNDS", "4"))):  # AI, a person helps, AI again...
        stuck, took = None, False
        for _ in range(int(os.getenv("DUE_AGENT_MAX_STEPS", "15"))):
          try:
            live.defer = False
            live.say(f"AI is looking for policy {policy}" + (f" · last: {history[-1]}" if history else ""), cur)
            live.defer = True  # from here a Take control waits for this step to be recorded
            err, _ = sign_in_if_needed(cur, (urlparse(cur.url).hostname or host), carrier, home_host=host)
            if err:
                res, cur, _ = ask_for_help(ctx, cur, task, f"{err}. Please sign in on the screen, "
                                                           "then press Let AI continue.")
                if res not in ("done", "resume"):
                    return {"error": err, **read_page(cur)}
                helped = True
                continue
            if _on_policy_page(cur, policy):
                break
            obs = cur.evaluate(OBSERVE_JS)
            act = _ai_wait(cur, ai_next_action, policy, names, obs, history)
            kind = act.get("action")
            by_i = {e["i"]: e for e in obs["elements"]}
            if kind == "done":
                break
            if kind == "fail" or kind not in ("click", "type", "select", "goto", "back"):
                stuck = f"AI couldn't find the policy: {act.get('reason') or kind}"
                break
            if kind in ("click", "type"):
                el = by_i.get(act.get("i"))
                if not el:
                    history.append(f"(invalid element {act.get('i')})")
                    continue
                text = str(act.get("text") or "")
                step = {"do": kind, "target": _desc(el)}
                if kind == "click" and _norm_js(policy) in _norm_js(el["text"]):
                    # A results link showing this policy number: match by the number next time
                    step["target"] = {**step["target"], "id": "", "text": "{policy}"}
                if kind == "type":
                    step.update(text="{policy}" if _norm_js(text) == _norm_js(policy) else text,
                                enter=bool(act.get("enter")))
                history.append(f"{kind} [{el['i']}] {el['text'] or el['placeholder'] or el['name']!r}"
                               + (f" text={text!r}" if kind == "type" else ""))
                try:
                    loc = cur.locator(f'[data-tpi="{el["i"]}"]').first
                    before = len(ctx.pages)
                    time.sleep(random.uniform(0.4, 1.2))  # people pause before acting
                    if kind == "type":
                        loc.click()
                        loc.fill("")
                        loc.press_sequentially(text, delay=random.randint(50, 110))
                        if act.get("enter"):
                            loc.press("Enter")
                    else:
                        loc.hover()
                        loc.click(delay=random.randint(40, 120))
                    settle(cur, 3000)
                    if len(ctx.pages) > before:
                        cur = ctx.pages[-1]
                        settle(cur, 3000)
                except Exception as e:
                    history.append(f"  -> failed: {str(e)[:80]}")
                    continue
            elif kind == "select":
                el = by_i.get(act.get("i"))
                opt = str(act.get("option") or "")
                if not el or el.get("options") is None or opt not in el["options"]:
                    history.append(f"(select needs a dropdown and one of its options: {act.get('i')} {opt!r})")
                    continue
                step = {"do": "select", "target": _desc(el), "option": opt}
                history.append(f"select [{el['i']}] {el['aria'] or el['name'] or el['id']!r} -> {opt!r}")
                try:
                    time.sleep(random.uniform(0.4, 1.0))
                    cur.locator(f'[data-tpi="{el["i"]}"]').first.select_option(label=opt)
                    settle(cur, 2500)
                except Exception as e:
                    history.append(f"  -> failed: {str(e)[:80]}")
                    continue
            elif kind == "goto":
                step = {"do": "goto", "url": str(act.get("url") or "")}
                if not step["url"].startswith("https://"):
                    history.append("(goto needs https://)")
                    continue
                history.append(f"goto {step['url']}")
                cur.goto(step["url"], wait_until="domcontentloaded", timeout=45000)
                settle(cur)
            else:
                step = {"do": "back"}
                history.append("back")
                cur.go_back(wait_until="domcontentloaded", timeout=30000)
                settle(cur)
            steps.append(step)
          except TakeOver:
            stuck, took = "You took control", True
            break
          finally:
            live.defer = False
        else:
            stuck = "AI ran out of steps before reaching the policy"
        if not took and live.pending == "take":  # pressed during the AI's very last step
            live.pending, stuck, took = None, "You took control", True

        if not stuck:
            break
        res, cur, hsteps = ask_for_help(
            ctx, cur, task,
            (f"You have control of {site}. Do what's needed (or click through to policy {policy}'s amount due), "
             "then press Let AI continue (or Done on the billing page)."
             if took else
             f"I couldn't get to policy {policy}'s billing on {site} ({stuck}). Help me past this step and press "
             "Let AI continue, or click through to the amount due and press Done."),
            forced=took)
        if res not in ("done", "resume"):
            return {"error": stuck[:200], **read_page(cur)}
        steps += hsteps
        helped = True
        if res == "done":
            break
        for st in hsteps:
            tg = st.get("target") or {}
            history.append(f"(person) {st['do']} {tg.get('text') or tg.get('placeholder') or tg.get('name') or tg.get('id') or st.get('url') or ''!r}"
                           + (f" -> {st['option']!r}" if st.get("option") else ""))
        history.append("(a person helped with the steps above; continue from this page)")
        log(f"[agent] {site}: you helped with {len(hsteps)} steps, AI continues")

    if steps and (_on_policy_page(cur, policy) or helped):
        # Save the steps with the policy number as a placeholder, so the next policy
        # on this site needs no AI and no help. Only steps that work for any policy:
        # ones that use the policy number, or (starting from a policy page) generic
        # clicks like the Billing tab.
        uses_policy = any(st.get("text") == "{policy}" or (st.get("target") or {}).get("text") == "{policy}"
                          for st in steps)
        if uses_policy or recipe_key == "agent_after_lookup":
            save_recipe(site, recipe_key, steps)
            log(f"[agent] {site}: learned {len(steps)} steps{' (with help)' if helped else ''}")
    live.say(f"Reading policy {policy}'s billing", cur)
    out = read_page(cur)
    if cur is not page:
        cur.close()
    return out


def _norm_js(s):
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


# ---------------- Tasks ----------------
def cell_text(html):
    t = re.sub(r"<br\s*/?>", " ", html, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t).replace("&nbsp;", " ").replace("&amp;", "&")
    t = t.replace("&#39;", "'").replace("&apos;", "'")
    return re.sub(r"\s+", " ", t).strip()


def parse_due_report(html):
    rows = []
    pat = re.compile(r"<tr class=rc[34]>([\s\S]*?)</tr>(?:\s*<tr class='tablesorter-childRow'[^>]*>([\s\S]*?)</tr>)?")
    td = re.compile(r"<td[^>]*>([\s\S]*?)</td>")
    for m in pat.finditer(html):
        c = [cell_text(x) for x in td.findall(m.group(1))]
        if len(c) < 17:
            continue
        detail = [cell_text(x) for x in td.findall(m.group(2))] if m.group(2) else []
        rows.append({"custId": c[1], "customer": c[2], "customerType": c[3], "businessName": c[4],
                     "phone1": c[6], "phone2": c[7], "office": c[8], "company": c[9], "companyLegal": c[10],
                     "lineType": c[11], "agent": c[12], "policy": c[13], "effDate": c[14], "expDate": c[15],
                     "dueDay": c[16], "address": detail[2] if len(detail) > 2 else ""})
    return rows


def _am_open(ctx, page, task, what):
    """Open AgencyMatrix signed in. If sign-in fails, ask the admin to sign in on the
    live screen. Returns (page, error or None)."""
    live.say(f"Opening AgencyMatrix to pull {what}", page)
    page.goto(AM_HOME, wait_until="domcontentloaded", timeout=45000)
    settle(page)
    err, _ = sign_in_if_needed(page, AM_HOST, "AgencyMatrix")
    if not err:
        return page, None
    res, page, _ = ask_for_help(ctx, page, task, f"AgencyMatrix: {err}. Please sign in on the screen, "
                                                 "then press Let AI continue.")
    if res not in ("done", "resume"):
        return page, err
    err, _ = sign_in_if_needed(page, AM_HOST, "AgencyMatrix")  # make sure it really is signed in now
    return page, err


def _am_report_page(ctx, page, task, url, what):
    """Open the AgencyMatrix report page (Reports > Policy Due Dates / Transaction Detail)
    on the live screen, so you can watch it and take over. If it bounced to sign-in,
    sign in again. Returns (page, error or None)."""
    live.say(f"Opening {what} in AgencyMatrix", page)
    page.goto(url, wait_until="domcontentloaded", timeout=45000)
    settle(page)
    try:
        page.wait_for_function("() => /run\\s*report/i.test(document.body.innerText || '')", timeout=15000)
    except Exception:
        err, _ = sign_in_if_needed(page, AM_HOST, "AgencyMatrix")
        if err:
            return page, err
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        settle(page)
    live.say(f"{what} open, pulling the report", page)
    return page, None


def _am_guarded(ctx, page, task, what, work):
    """Run work(page) with Take control available: after you hand it back, it runs again."""
    for _ in range(3):
        try:
            return work(page)
        except TakeOver:
            res, page, _ = ask_for_help(ctx, ctx.pages[-1], task, f"You have control of AgencyMatrix ({what}). "
                                        "Do what's needed, then press Let AI continue.", forced=True)
            if res not in ("done", "resume"):
                raise Stopped()
    return work(page)


def run_report(ctx, page, task):
    def fail(why):
        log(f"[report] failed: {why}")
        return api("/reminders/report", {"computer": NAME, "runId": task["runId"], "ok": False, "error": why})

    def work(page):
        page, err = _am_open(ctx, page, task, "the due-date report")
        if err:
            return "fail", err, page
        page, err = _am_report_page(ctx, page, task, AM_DUE_PAGE, "Policy Due Dates")
        if err:
            return "fail", err, page
        by_target = {}
        for q in task["queries"]:
            live.say(f"Pulling the due-date report for {q['target']}", page)
            out = page.evaluate(REPORT_JS, q["query"])
            if not out.get("ok"):
                log(f"[report] {q['target']}: {out.get('error')} {out.get('sample', '')}")
                res, page, _ = ask_for_help(
                    ctx, page, task, f"The due-date report for {q['target']} didn't come back "
                                     f"({out.get('error')}). Check the screen (sign in again if needed), "
                                     "then press Let AI continue to try again.")
                if res in ("done", "resume"):
                    page, _ = _am_report_page(ctx, page, task, AM_DUE_PAGE, "Policy Due Dates")
                    out = page.evaluate(REPORT_JS, q["query"])
                if not out.get("ok"):
                    return "fail", f"Due-date report: {out.get('error')} {out.get('sample', '')[:120]}", page
            rows = parse_due_report(out["html"]) if out["html"] else []
            log(f"[report] {q['target']}: {len(rows)} policies")
            by_target.setdefault(q["target"], []).extend(rows)
        return "ok", by_target, page

    try:
        status, val, page = _am_guarded(ctx, page, task, "due-date report", work)
    except Stopped:
        return fail("Stopped from the admin page")
    except SiteDown as e:
        return fail(f"AgencyMatrix is down: {e}")
    if status == "fail":
        return fail(val)
    results = [{"target": t, "rows": rows} for t, rows in val.items()]
    live.say(f"Sending {sum(len(r['rows']) for r in results)} due policies to the list", page)
    out = api("/reminders/report", {"computer": NAME, "runId": task["runId"], "ok": True, "results": results})
    log(f"[report] sent {sum(len(r['rows']) for r in results)} rows -> {out}")


# ---------------- Daily: Transaction Details -> Accounting ----------------
# Same direct request the Transaction Details page sends; the HTML table is turned
# into the same columns as the CSV and sent to the Accounting import.
TX_JS = r"""async ([day, asof, url]) => {
  const form = new URLSearchParams({ territory: "21889", division: "23094", region: "22632", district: "69830",
    "office[]": "0", customerType: "0", customerSubType: "0", company: "0|- All Companies -",
    dateType: "trandate|Transaction Date", sdate: day, sdateDateRange: "Date Range", edate: day,
    adate: asof, adateDateRange: "Date Range", orderBy: "All|All", tranType: "All|All", status: "Any|Any Status",
    carrier: "0|No", saveReportFrequency: "None", saveReportReportType: "HTML-Link" });
  const res = await fetch(url || "https://agents.agencymatrix.com/rptTransDetail2.php?Action=Run", { method: "POST",
    credentials: "include", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form });
  const html = await res.text();
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  const doc = new DOMParser().parseFromString(html, "text/html");
  const clean = (t) => (t || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  let headers = null;
  const rows = [];
  for (const table of doc.querySelectorAll("table")) {
    const trs = [...table.querySelectorAll("tr")];
    const hi = trs.findIndex((tr) => {
      const cells = [...tr.children].map((c) => clean(c.textContent));
      return cells.includes("Receipt") && (cells.includes("Policy Type") || cells.includes("Method"));
    });
    if (hi < 0) continue;
    const h = [...trs[hi].children].map((c) => clean(c.textContent));
    if (!headers) headers = h;
    for (const tr of trs.slice(hi + 1)) {
      const cells = [...tr.children].map((c) => clean(c.textContent));
      if (cells.length !== h.length || cells.join("") === h.join("")) continue;
      const row = {};
      h.forEach((name, i) => { if (name) row[name] = cells[i]; });
      // A voided receipt may only be shown with strike-through: mark it like the CSV does
      if (tr.querySelector("s, strike, del") || /line-through/.test(tr.getAttribute("style") || "")) row._void = "VOIDED";
      rows.push(row);
    }
  }
  const text = clean(doc.body ? doc.body.textContent : "");
  if (!headers && !/no (records|results|transactions)|nothing to report/i.test(text))
    return { ok: false, error: "Couldn't find the Transaction Detail table", sample: text.slice(0, 300) };
  return { ok: true, headers: headers || [], rows };
}"""

SITE_URL = os.getenv("SITE_URL", "https://www.texaspremiumins.com").rstrip("/")


def run_txreport(ctx, page, task):
    """task: {"date": "11/23/2026", "dateKey": "2026-11-23"}"""
    day, key = task["date"], task["dateKey"]

    def done(ok, **info):
        api("/accounting/pull-done", {"dateKey": key, "ok": ok, **info})

    try:
        page, err = _am_open(ctx, page, task, f"Transaction Details for {day}")
        if err:
            return done(False, error=err)
        page, err = _am_report_page(ctx, page, task, AM_TX_PAGE, "Transaction Detail")
        if err:
            return done(False, error=err)
        try:
            asof = datetime.now(ZoneInfo("America/Chicago")).strftime("%m/%d/%Y")
        except Exception:  # no time-zone data: Central time without daylight saving is close enough here
            asof = datetime.now(timezone.utc).astimezone(timezone(timedelta(hours=-6))).strftime("%m/%d/%Y")
        live.say(f"Pulling Transaction Details for {day}", page)
        out = _am_guarded(ctx, page, task, "Transaction Details",
                          lambda pg: pg.evaluate(TX_JS, [day, asof, os.getenv("AM_TX_URL", "")]))
        if not out.get("ok"):
            log(f"[tx] {day}: {out.get('error')} {out.get('sample', '')}")
            return done(False, error=out.get("error", "")[:200])
        r = requests.post(f"{SITE_URL}/api/accounting/auto-import", timeout=120,
                          headers={"X-Office-Key": KEY},
                          json={"dateKey": key, "headers": out["headers"], "rows": out["rows"]})
        info = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        if not r.ok:
            log(f"[tx] {day}: import refused {r.status_code} {info}")
            return done(False, error=str(info.get("error") or f"HTTP {r.status_code}")[:200])
        log(f"[tx] {day}: {len(out['rows'])} rows -> {info}")
        return done(True, inserted=info.get("inserted", 0), rows=len(out["rows"]))
    except (Stopped, SiteDown) as e:
        log(f"[tx] {day}: {type(e).__name__} {e}")
        return done(False, error=f"{type(e).__name__}: {e}"[:200])
    except Exception as e:  # any other crash: record it so it retries, instead of staying "running"
        log(f"[tx] {day}: {type(e).__name__}: {e}")
        return done(False, error=f"{type(e).__name__}: {e}"[:200])


def run_policy(ctx, page, task):
    url = task["url"]
    host = (urlparse(url).hostname or "").lower()
    search = task.get("search")
    policy = (search or {}).get("policy") or ""

    live.say(f"Opening {site_domain(host)}" + (f" for policy {policy}" if policy else ""), page)
    open_site(page, url)
    names = task.get("names") or []
    err, signed_in = sign_in_if_needed(page, host, names[0] if names else site_domain(host), home_host=host)
    check_down(page)
    if err:
        return {"error": err, **read_page(page)}
    if signed_in:  # portals usually land on their home page after a sign-in
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        settle(page)

    if search:
        saved = recipes().get(host, {}).get("search")
        steps = [saved] if saved else []
        steps.append({"input": search.get("input"), "button": search.get("button")})
        done = False
        for step in steps:
            r = page.evaluate(FILL_JS, [policy, step.get("input"), step.get("button")])
            if r.get("ok"):
                done = True
                break
        if not done:
            if saved:
                save_recipe(host, "search", None)  # site changed: learn it again
            step = ai_pick_search(page, host)
            if step and page.evaluate(FILL_JS, [policy, step["input"], step.get("button")]).get("ok"):
                done = True
        if not done:
            return {"error": "Couldn't find the policy search box", **read_page(page)}
        live.say(f"Searching policy {policy}", page)
        page.locator("[data-tp=search]").first.fill(policy)
        before = len(ctx.pages)
        click_or_enter(page, "[data-tp=searchgo]", "[data-tp=search]")
        settle(page)
        if page.evaluate(OPEN_JS, policy):
            settle(page)
        if len(ctx.pages) > before:  # opened in a new tab
            newest = ctx.pages[-1]
            settle(newest, 3000)
            out = read_page(newest)
            newest.close()
            return out
    return read_page(page)


HUMAN_JS = r"""
Object.defineProperty(navigator, "webdriver", { get: () => undefined });
Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
Object.defineProperty(navigator, "platform", { get: () => "Win32" });
Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
if (!window.chrome) window.chrome = { runtime: {} };
"""


def start_screen():
    """Real Chrome needs a screen. Start a virtual one (Xvfb) if there isn't one, so it
    works even when Railway's Start Command skips xvfb-run. Returns True = run headless."""
    if os.getenv("HEADLESS", "0") == "1":
        return True
    if os.environ.get("DISPLAY"):
        return False
    try:
        subprocess.Popen(["Xvfb", ":99", "-screen", "0", "1366x900x24", "-nolisten", "tcp", "-ac"],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except FileNotFoundError:
        log("Xvfb isn't installed: running Chrome headless")
        return True
    os.environ["DISPLAY"] = ":99"
    for _ in range(100):
        if os.path.exists("/tmp/.X11-unix/X99"):
            break
        time.sleep(0.1)
    log("Virtual screen :99 started")
    return False


def take_over(ctx, task):
    """Admin pressed Take control outside the AI loop (signing in, saved steps, search)."""
    page = ctx.pages[-1] if ctx.pages else ctx.new_page()
    policy = task.get("policy") or (task.get("search") or {}).get("policy") or ""
    res, page, steps = ask_for_help(ctx, page, {**task, "policy": policy},
                                    f"You have control. Click through to policy {policy}'s amount due, "
                                    "then press Done, or Let AI continue.", forced=True)
    if res == "resume":  # the AI takes it from the page you left it on (not saved as the site's steps)
        return run_agent(ctx, page, {**task, "policy": policy, "portal": page.url, "here": True},
                         recipe_key="_resumed")
    if res != "done":
        return {"error": "Taken over from the admin page and not finished", **read_page(page)}
    if steps and task.get("mode") == "agent" and any(
            st.get("text") == "{policy}" or (st.get("target") or {}).get("text") == "{policy}" for st in steps):
        site = site_domain(urlparse(steps[0].get("url") or page.url).hostname or "")
        save_recipe(site, "agent", steps)
        log(f"[agent] {site}: learned {len(steps)} steps from you")
    return read_page(page)


def main():
    os.makedirs(PROFILE, exist_ok=True)
    # A container that was killed leaves Chrome's lock files on the volume, and the
    # next start then refuses the profile ("in use on another computer"). Only this
    # worker uses the volume, so clear them.
    for name in ("SingletonLock", "SingletonSocket", "SingletonCookie"):
        try:
            os.unlink(os.path.join(PROFILE, name))  # unlink also removes broken symlinks
        except FileNotFoundError:
            pass
        except Exception as e:
            log(f"Couldn't clear {name}: {e}")
    headless = start_screen()
    with sync_playwright() as p:
        # Looks like a normal person's Chrome: real (non-headless) window on a virtual
        # screen, a regular Chrome user agent, no automation flags, Texas time zone.
        ctx = p.chromium.launch_persistent_context(
            PROFILE, headless=headless,
            viewport={"width": 1366, "height": 900}, locale="en-US", timezone_id="America/Chicago",
            user_agent=os.getenv("BROWSER_UA", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                                               "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"),
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox",
                  "--disable-dev-shm-usage", "--window-size=1366,900"],
            ignore_default_args=["--enable-automation"],
        )
        ctx.add_init_script(HUMAN_JS)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        log(f"Cloud worker '{NAME}' started")
        try:
            vault.load(force=True)  # say right away whether Bitwarden works
        except Exception as e:
            log(f"[vault] NOT WORKING: {e}")
        while True:
            busy = False
            if live.hold:  # Paused from the admin page
                live.idle("Paused from the admin page")
                time.sleep(10)
                continue
            try:
                for _ in range(25):
                    if live.hold:
                        break
                    task = api("/reminders/next", {"computer": NAME})
                    kind = task.get("type")
                    if kind == "txreport":
                        busy = True
                        task.setdefault("names", ["AgencyMatrix"])
                        live.start(task, f"Pulling Transaction Details for {task['date']} from AgencyMatrix")
                        run_txreport(ctx, page, task)
                    elif kind == "report":
                        busy = True
                        # The live view shows it, with Take control / Stop and help if sign-in fails
                        task.setdefault("id", f"report-{task['runId']}")
                        task.setdefault("names", ["AgencyMatrix"])
                        live.start(task, "Pulling the due-date report from AgencyMatrix")
                        run_report(ctx, page, task)
                    elif kind == "policy":
                        busy = True
                        live.start(task, "Starting a policy check")
                        try:
                            if task.get("mode") == "agent":
                                result = run_agent(ctx, page, task)
                            else:
                                result = run_policy(ctx, page, task)
                                # The saved lookup didn't reach the billing page (site changed,
                                # billing on another tab...): let the AI take it from there
                                policy = task.get("policy") or (task.get("search") or {}).get("policy") or ""
                                if policy and not shows_billing(result, policy):
                                    log(f"[policy] {task['id']}: lookup didn't reach billing, AI takes over")
                                    alt = run_agent(ctx, page, {**task, "policy": policy, "portal": task["url"]},
                                                    recipe_key="agent_after_lookup")
                                    if not alt.get("error") or not result.get("text"):
                                        result = alt
                        except SiteDown as e:
                            live.say(f"{e}. Moving on to other carriers", None)
                            result = {"error": f"SITE_DOWN: {e}"[:300], "text": ""}
                        except Stopped:
                            log(f"[policy] {task['id']}: stopped from the admin page")
                            result = {"error": "Stopped from the admin page", **read_page(ctx.pages[-1])}
                        except TakeOver:
                            result = take_over(ctx, task)
                        except Exception as e:
                            result = {"error": f"{type(e).__name__}: {e}"[:300], **read_page(page)}
                        # Close extra tabs a carrier site opened so the next check starts clean
                        for extra in ctx.pages[1:]:
                            if extra is not page:
                                try:
                                    extra.close()
                                except Exception:
                                    pass
                        out = api("/reminders/check", {"computer": NAME, "runId": task["runId"], "id": task["id"],
                                                       "url": task.get("url") or result.get("finalUrl") or "",
                                                       **result})
                        log(f"[policy] {task['id']} -> {out.get('status')}"
                            f"{' (' + result['error'] + ')' if result.get('error') else ''}")
                    else:
                        break
            except (Exception, Stopped, TakeOver, SiteDown):
                log("[loop] error:\n" + traceback.format_exc()[-1500:])
                try:
                    page.close()
                except Exception:
                    pass
                page = ctx.new_page()
            live.idle()
            time.sleep(5 if busy else 60)


if __name__ == "__main__":
    main()