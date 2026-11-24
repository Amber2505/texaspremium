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
import time
import traceback
from datetime import datetime, timezone
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
        r = subprocess.run(["bw", *args], capture_output=True, text=True, timeout=180,
                           env={**os.environ, **(extra or {})})
        if r.returncode:
            raise RuntimeError(f"bw {args[0]} failed: {(r.stderr or r.stdout).strip()[:200]}")
        return r.stdout.strip()

    def load(self):
        if self.items is not None and time.time() - self.loaded < 3600:
            return
        status = json.loads(self._bw("status") or "{}").get("status")
        if status == "unauthenticated":
            if os.getenv("BW_CLIENTID") and os.getenv("BW_CLIENTSECRET"):
                # API key: no "new device" email code from Bitwarden
                self._bw("login", "--apikey")
            else:
                # Email + master password. Bitwarden may email a new-device code the first
                # time; if this fails, add BW_CLIENTID / BW_CLIENTSECRET (see README).
                self._bw("login", os.environ["BITWARDEN_EMAIL"], "--passwordenv", "BITWARDEN_PASSWORD")
        session = self._bw("unlock", "--passwordenv", "BITWARDEN_PASSWORD", "--raw")
        self._bw("sync", "--session", session)
        items = json.loads(self._bw("list", "items", "--session", session))
        self.items = [i for i in items if i.get("type") == 1 and (i.get("login") or {}).get("password")]
        self.loaded = time.time()
        log(f"[vault] {len(self.items)} logins loaded")

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


def email_code(since_ts, host, timeout=240):
    """Newest code emailed to EMAIL_INTERNAL by this carrier after since_ts."""
    user, pw = os.getenv("EMAIL_INTERNAL"), os.getenv("EMAIL_INTERNAL_PASS")
    if not user or not pw:
        log("[code] EMAIL_INTERNAL not set")
        return None
    word = site_domain(host).split(".")[0]
    end = time.time() + timeout
    while time.time() < end:
        time.sleep(10)
        try:
            m = imaplib.IMAP4_SSL(IMAP_HOST)
            m.login(user, pw)
            m.select("INBOX")
            day = datetime.fromtimestamp(since_ts - 86400, timezone.utc).strftime("%d-%b-%Y")
            _, data = m.search(None, f'(SINCE "{day}")')
            for mid in reversed(data[0].split()[-20:]):
                _, raw = m.fetch(mid, "(RFC822)")
                msg = email.message_from_bytes(raw[0][1])
                try:
                    if parsedate_to_datetime(msg.get("Date")).timestamp() < since_ts - 60:
                        continue
                except Exception:
                    continue
                subject = str(email.header.make_header(email.header.decode_header(msg.get("Subject") or "")))
                body = _email_text(msg)
                if word not in f"{msg.get('From')} {subject} {body}".lower():
                    continue
                hit = re.search(r"(?<![\d$.,])(\d{6})(?![\d,])", f"{subject} {body}") or \
                    re.search(r"(?<![\d$.,])(\d{4,8})(?![\d,])", f"{subject} {body}")
                if hit:
                    m.logout()
                    log(f"[code] email code found for {host}")
                    return hit.group(1)
            m.logout()
        except Exception as e:
            log(f"[code] inbox check failed: {e}")
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
  return res.ok && html.includes("Policy Due Dates") && html.includes("id='sortable'") ? html : null;
}"""


def settle(page, ms=4000):
    try:
        page.wait_for_load_state("domcontentloaded", timeout=30000)
    except Exception:
        pass
    page.wait_for_timeout(ms)


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
def sign_in_if_needed(page, host, carrier):
    """Handles login forms, 'send code by email' choices and code boxes.
    Returns (error_or_None, signed_in_now)."""
    did, code_sent_at = False, None
    for _ in range(6):
        st = page.evaluate(MARK_JS)
        if st["pass"] or st["user"]:
            cred = vault.login_for(host)
            if not cred:
                return f"No Bitwarden login saved for {site_domain(host)}", did
            if did and st["pass"]:
                return f"Sign-in to {site_domain(host)} was rejected (check the password in Bitwarden: {cred['item']})", did
            if st["user"]:
                page.locator("[data-tp=user]").first.fill(cred["user"])
            if st["pass"]:
                page.locator("[data-tp=pass]").first.fill(cred["pass"])
            if page.locator("[data-tp=remember]").count():
                page.locator("[data-tp=remember]").first.check()
            click_or_enter(page, "[data-tp=go]", "[data-tp=pass]" if st["pass"] else "[data-tp=user]")
            did = True
            log(f"[login] {host} with {cred['item']}")
        elif st["asksCode"] and st["emailOpt"] and not code_sent_at:
            page.locator("[data-tp=email]").first.click()
            page.wait_for_timeout(800)
            page.evaluate(MARK_JS)
            click_or_enter(page, "[data-tp=go]", None)
            code_sent_at = time.time()
            log(f"[code] asked {host} to email the code")
        elif st["otp"]:
            if st["authApp"]:
                code = admin_code(host, carrier)
            else:
                code = email_code(code_sent_at or time.time() - 180, host)
            if not code:
                return f"{carrier}: verification code never arrived", did
            page.evaluate(MARK_JS)
            page.locator("[data-tp=otp]").first.fill(code)
            if page.locator("[data-tp=remember]").count():
                page.locator("[data-tp=remember]").first.check()
            click_or_enter(page, "[data-tp=go]", "[data-tp=otp]")
            did = True
        else:
            return None, did
        settle(page)
    return f"Still on the sign-in page for {site_domain(host)}", did


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
    return { i, tag: e.tagName.toLowerCase(), type: e.type || "", id: e.id || "", name: e.getAttribute("name") || "",
      placeholder: e.placeholder || "", aria: e.getAttribute("aria-label") || "",
      text: (e.innerText || e.value || e.title || "").trim().replace(/\s+/g, " ").slice(0, 50) };
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
        for e in obs["elements"])
    prompt = (
        "You operate an insurance AGENT portal in a web browser. Goal: open policy number "
        f"{policy} (carrier: {', '.join(names)}) and get to the page that shows that policy's billing: "
        "amount due and next payment due date. Sign-in is already handled for you.\n"
        "Pick ONE next action. Answer JSON only, one of:\n"
        '{"action":"click","i":N}\n'
        '{"action":"type","i":N,"text":"...","enter":true|false}\n'
        '{"action":"goto","url":"https://..."}\n'
        '{"action":"back"}\n'
        '{"action":"done"}   (this page shows the policy\'s amount due / due date)\n'
        '{"action":"fail","reason":"..."}  (policy not found, or the site can\'t do it)\n'
        "Tips: use the policy search box (often 'Policy #', 'Find', 'Quick Search', 'Search'); "
        "open the matching policy from the results; billing is often under a 'Billing', 'Payments' "
        "or 'Account' tab. Never type passwords. Don't repeat an action that didn't change anything.\n\n"
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
        if step["do"] == "type":
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
_help_snooze_until = 0.0

POINT_JS = r"""([x, y]) => {
  let el = document.elementFromPoint(x, y);
  if (!el) return null;
  el = el.closest("a, button, input, select, textarea, [role=button], [role=tab], [role=link], [onclick], tr, li") || el;
  return { tag: el.tagName.toLowerCase(), id: el.id || "", name: el.getAttribute("name") || "",
    placeholder: el.placeholder || "",
    text: (el.innerText || el.value || el.title || "").trim().replace(/\s+/g, " ").slice(0, 50) };
}"""

FOCUS_JS = r"""() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  return { tag: el.tagName.toLowerCase(), id: el.id || "", name: el.getAttribute("name") || "",
    placeholder: el.placeholder || "", text: "", secret: (el.type || "").toLowerCase() === "password" };
}"""


def _shot(page):
    try:
        return base64.b64encode(page.screenshot(type="jpeg", quality=55)).decode()
    except Exception:
        return ""


def ask_for_help(ctx, page, task, question):
    """Returns (result, page, steps). result: done | skip | timeout | snoozed."""
    global _help_snooze_until
    if time.time() < _help_snooze_until:
        return "snoozed", page, []
    hid = task["id"]
    policy = task.get("policy") or ""
    names = task.get("names") or []
    log(f"[help] asking for help: {question}")
    api("/reminders/help/open", {"id": hid, "computer": NAME, "carrier": names[0] if names else "",
                                 "policy": policy, "question": question, "url": page.url,
                                 "screenshot": _shot(page)})
    steps, deadline, last_frame = [], time.time() + HELP_WAIT_MIN * 60, time.time()
    while time.time() < deadline:
        acts = api("/reminders/help/take", {"id": hid}).get("actions") or []
        for a in acts:
            deadline = max(deadline, time.time() + HELP_WAIT_MIN * 60)  # someone is helping
            t = a.get("type")
            if t in ("done", "skip"):
                api("/reminders/help/close", {"id": hid, "status": t})
                log(f"[help] {t} ({len(steps)} steps)")
                return t, page, steps
            try:
                if t == "click":
                    x, y = float(a["x"]), float(a["y"])
                    desc = page.evaluate(POINT_JS, [x, y])
                    before = len(ctx.pages)
                    page.mouse.move(x - 3, y - 2)
                    page.mouse.click(x, y, delay=random.randint(40, 120))
                    if desc and (desc["id"] or desc["name"] or desc["placeholder"] or desc["text"]):
                        st = {"do": "click", "target": desc}
                        if policy and _norm_js(policy) in _norm_js(desc["text"]):
                            st["target"] = {**desc, "id": "", "text": "{policy}"}
                        steps.append(st)
                    settle(page, 2500)
                    if len(ctx.pages) > before:
                        page = ctx.pages[-1]
                        settle(page, 2500)
                elif t == "type":
                    text = str(a.get("text") or "")
                    focused = page.evaluate(FOCUS_JS)
                    page.keyboard.type(text, delay=random.randint(50, 110))
                    if focused and not focused.pop("secret", False):
                        steps.append({"do": "type", "target": focused,
                                      "text": "{policy}" if policy and _norm_js(text) == _norm_js(policy) else text})
                elif t == "key" and a.get("key") in ("Enter", "Tab", "Escape", "Backspace"):
                    page.keyboard.press(a["key"])
                    if a["key"] == "Enter" and steps and steps[-1]["do"] == "type":
                        steps[-1]["enter"] = True
                    settle(page, 2500)
                elif t == "goto" and str(a.get("url") or "").startswith("http"):
                    page.goto(a["url"], wait_until="domcontentloaded", timeout=45000)
                    steps.append({"do": "goto", "url": a["url"]})
                    settle(page)
                elif t == "scroll":
                    page.mouse.wheel(0, float(a.get("dy") or 500))
                    time.sleep(0.5)
                elif t == "back":
                    page.go_back(wait_until="domcontentloaded", timeout=30000)
                    steps.append({"do": "back"})
                    settle(page)
            except Exception as e:
                log(f"[help] action {t} failed: {e}")
        if acts or time.time() - last_frame > 12:
            try:
                title = page.title()
            except Exception:
                title = ""
            api("/reminders/help/frame", {"id": hid, "url": page.url, "title": title, "screenshot": _shot(page)})
            last_frame = time.time()
        time.sleep(1.5)
    api("/reminders/help/close", {"id": hid, "status": "timeout"})
    _help_snooze_until = time.time() + 60 * 60  # don't keep blocking the queue for the next hour
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
        if res != "done":
            return {"error": f"No website known for {carrier} (save its login in Bitwarden, or help when asked)",
                    "text": ""}
        first_goto = next((s["url"] for s in hsteps if s["do"] == "goto"), page2.url)
        _remember_portal(names, first_goto)
        out = read_page(page2)
        if page2 is not page:
            page2.close()
        return out

    host = (urlparse(start).hostname or "").lower()
    site = site_domain(host)

    page.goto(start, wait_until="domcontentloaded", timeout=45000)
    settle(page)
    err, _ = sign_in_if_needed(page, host, carrier)
    if err:
        res, page, _ = ask_for_help(ctx, page, task, f"{err}. Please sign in on the screen "
                                                     f"(or fix it in Bitwarden and press Skip), then press Done.")
        if res != "done":
            return {"error": err, **read_page(page)}
        helped = True
    home = page.url

    # 1) Saved steps for this site: no AI
    saved = recipes().get(site, {}).get(recipe_key)
    if saved:
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
    stuck = None
    for _ in range(int(os.getenv("DUE_AGENT_MAX_STEPS", "15"))):
        err, _ = sign_in_if_needed(cur, (urlparse(cur.url).hostname or host), carrier)
        if err:
            res, cur, _ = ask_for_help(ctx, cur, task, f"{err}. Please sign in on the screen, then press Done.")
            if res != "done":
                return {"error": err, **read_page(cur)}
            helped = True
            continue
        if _on_policy_page(cur, policy):
            break
        obs = cur.evaluate(OBSERVE_JS)
        act = ai_next_action(policy, names, obs, history)
        kind = act.get("action")
        by_i = {e["i"]: e for e in obs["elements"]}
        if kind == "done":
            break
        if kind == "fail" or kind not in ("click", "type", "goto", "back"):
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
    else:
        stuck = "AI ran out of steps before reaching the policy"

    if stuck:
        res, cur, hsteps = ask_for_help(
            ctx, cur, task, f"I couldn't get to policy {policy}'s billing on {site} ({stuck}). "
                            "Please click through to the page that shows its amount due, then press Done.")
        if res != "done":
            return {"error": stuck[:200], **read_page(cur)}
        steps += hsteps
        helped = True

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


def run_report(page, task):
    def fail(why):
        log(f"[report] failed: {why}")
        return api("/reminders/report", {"computer": NAME, "runId": task["runId"], "ok": False, "error": why})

    page.goto(AM_HOME, wait_until="domcontentloaded", timeout=45000)
    settle(page)
    err, _ = sign_in_if_needed(page, AM_HOST, "AgencyMatrix")
    if err:
        return fail(err)
    by_target = {}
    for q in task["queries"]:
        html = page.evaluate(REPORT_JS, q["query"])
        if not html:
            return fail("AgencyMatrix report not available on this login")
        by_target.setdefault(q["target"], []).extend(parse_due_report(html))
    results = [{"target": t, "rows": rows} for t, rows in by_target.items()]
    out = api("/reminders/report", {"computer": NAME, "runId": task["runId"], "ok": True, "results": results})
    log(f"[report] sent {sum(len(r['rows']) for r in results)} rows -> {out}")


def run_policy(ctx, page, task):
    url = task["url"]
    host = (urlparse(url).hostname or "").lower()
    search = task.get("search")
    policy = (search or {}).get("policy") or ""

    page.goto(url, wait_until="domcontentloaded", timeout=45000)
    settle(page)
    err, signed_in = sign_in_if_needed(page, host, site_domain(host))
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


def main():
    os.makedirs(PROFILE, exist_ok=True)
    with sync_playwright() as p:
        # Looks like a normal person's Chrome: real (non-headless) window on a virtual
        # screen, a regular Chrome user agent, no automation flags, Texas time zone.
        ctx = p.chromium.launch_persistent_context(
            PROFILE, headless=os.getenv("HEADLESS", "0") == "1",
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
        while True:
            busy = False
            try:
                for _ in range(25):
                    task = api("/reminders/next", {"computer": NAME})
                    kind = task.get("type")
                    if kind == "report":
                        busy = True
                        run_report(page, task)
                    elif kind == "policy":
                        busy = True
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
                        except Exception as e:
                            result = {"error": f"{type(e).__name__}: {e}"[:300], **read_page(page)}
                        out = api("/reminders/check", {"computer": NAME, "runId": task["runId"], "id": task["id"],
                                                       "url": task.get("url") or result.get("finalUrl") or "",
                                                       **result})
                        log(f"[policy] {task['id']} -> {out.get('status')}"
                            f"{' (' + result['error'] + ')' if result.get('error') else ''}")
                    else:
                        break
            except Exception:
                log("[loop] error:\n" + traceback.format_exc()[-1500:])
                try:
                    page.close()
                except Exception:
                    pass
                page = ctx.new_page()
            time.sleep(5 if busy else 60)


if __name__ == "__main__":
    main()