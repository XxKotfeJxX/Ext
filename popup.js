const toggle = document.getElementById("toggle");
const status = document.getElementById("status");

function setStatus(enabled) {
  toggle.checked = enabled;
  status.textContent = enabled
    ? "Статус: увімкнено"
    : "Статус: вимкнено";
}

function readSetting() {
  chrome.storage.local.get(["aiEnabled"], (data) => {
    setStatus(data.aiEnabled !== false);
  });
}

toggle.addEventListener("change", () => {
  chrome.storage.local.set({ aiEnabled: toggle.checked });
  setStatus(toggle.checked);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.prototype.hasOwnProperty.call(changes, "aiEnabled")) {
    setStatus(changes.aiEnabled.newValue !== false);
  }
});

readSetting();
