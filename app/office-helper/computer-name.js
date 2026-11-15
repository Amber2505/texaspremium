const input = document.getElementById("computerName");
const status = document.getElementById("computerNameStatus");

chrome.storage.local.get("computerName").then(({ computerName }) => {
  input.value = computerName || "";
  status.textContent = computerName
    ? `Saved as "${computerName}"`
    : "Name this computer so we know where documents come from.";
});

document.getElementById("saveComputerName").addEventListener("click", async () => {
  const name = input.value.trim().replace(/\s+/g, " ").slice(0, 40);
  if (!name) return (status.textContent = "Please enter a name.");
  await chrome.storage.local.set({ computerName: name });
  status.textContent = `Saved as "${name}"`;
});