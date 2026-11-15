// Reads the client's name + phone from TurboRater (Single Screen or Policy tab)
// and hands it to the background script, which logs it as a quote to follow up.
(() => {
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const digits = (s) => (s || "").replace(/\D/g, "");
  const visibleInputs = (el) =>
    [...el.querySelectorAll("input[type=text], input:not([type])")]
      .filter((i) => i.offsetParent !== null);

  // The row that holds a label like "First, M, Last Name" or "Cell Phone"
  function rowFor(labelRe) {
    for (const el of document.querySelectorAll("td, th, span, label, div")) {
      if (el.children.length > 2 || !labelRe.test(clean(el.textContent))) continue;
      let row = el;
      for (let i = 0; i < 4 && row; i++) {
        row = row.parentElement;
        if (row && visibleInputs(row).length) return row;
      }
    }
    return null;
  }

  function readName() {
    const row = rowFor(/^First,\s*M,\s*Last Name$/i);
    if (!row) return {};
    const ins = visibleInputs(row);
    return { first: clean(ins[0]?.value), last: clean((ins[2] || ins[ins.length - 1])?.value) };
  }

  function readPhone() {
    const found = [];
    // Policy tab: "Cell Phone" / "Home Phone" / "Work Phone" labels
    for (const re of [/^Cell Phone$/i, /^Home Phone$/i, /^Work Phone$/i]) {
      const row = rowFor(re);
      if (row) found.push(visibleInputs(row)[0]?.value);
    }
    // Single Screen: Mobile/Home/Work dropdown beside each phone box, mobile first
    const isCell = (s) => /mobile|cell/i.test(s.selectedOptions[0]?.text || "");
    const sels = [...document.querySelectorAll("select")]
      .filter((s) => [...s.options].some((o) => /^Mobile$/i.test(o.text.trim())))
      .sort((a, b) => isCell(b) - isCell(a));
    for (const s of sels) {
      const row = s.closest("tr") || s.parentElement?.parentElement;
      if (row) found.push(visibleInputs(row)[0]?.value);
    }
    return found.map(digits).find((d) => d.length === 10) || "";
  }

  let lastSent = "";
  function check() {
    const { first, last } = readName();
    const phone = readPhone();
    if (!first || !last || phone.length !== 10) return;
    const key = `${first}|${last}|${phone}`.toUpperCase();
    if (key === lastSent) return;
    lastSent = key;
    chrome.runtime.sendMessage({ type: "quote", first, last, phone, page: location.pathname });
  }

  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(check, 1000); };
  document.addEventListener("change", schedule, true);   // fires when they leave a field
  document.addEventListener("focusout", schedule, true);
  window.addEventListener("pagehide", check);            // tab change / Next / close
  setTimeout(check, 2000);                               // reopened quote, already filled
})();