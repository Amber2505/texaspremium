const VERIFY_URL = "https://astraldbapi.herokuapp.com/docs/office-key-check";
const input = document.getElementById("code");
const button = document.getElementById("save");
const status = document.getElementById("status");

const show = (text, color) => {
  status.textContent = text;
  status.style.color = color;
};

chrome.storage.local.get("officeKey").then(({ officeKey }) => {
  if (officeKey) show("✓ Activated on this computer", "#059669");
});

button.addEventListener("click", async () => {
  const code = input.value.trim();
  if (!code) return;
  button.disabled = true;
  show("Checking…", "#64748b");
  try {
    const res = await fetch(VERIFY_URL, { headers: { "X-Office-Key": code } });
    if (res.ok) {
      await chrome.storage.local.set({ officeKey: code });
      input.value = "";
      show("✓ Activated on this computer", "#059669");
    } else {
      show("Wrong code", "#dc2626");
    }
  } catch {
    show("Couldn't reach the server. Try again.", "#dc2626");
  } finally {
    button.disabled = false;
  }
});