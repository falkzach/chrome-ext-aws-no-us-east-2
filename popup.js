(function () {
  "use strict";

  const { ENABLED_STORAGE_KEY } = globalThis.AwsRegionRules;

  const toggle = document.getElementById("enabled-toggle");
  const stateLabel = document.getElementById("state-label");
  const stateHelp = document.getElementById("state-help");
  const openOptions = document.getElementById("open-options");

  function render(enabled) {
    toggle.checked = enabled;
    stateLabel.textContent = enabled ? "Rewrites Enabled" : "Rewrites Disabled";
    stateHelp.textContent = enabled
      ? "AWS Console region redirects are active."
      : "Saved rules are paused.";
  }

  async function loadState() {
    const result = await chrome.storage.sync.get(ENABLED_STORAGE_KEY);
    render(result[ENABLED_STORAGE_KEY] !== false);
  }

  toggle.addEventListener("change", async () => {
    const enabled = toggle.checked;
    render(enabled);
    await chrome.storage.sync.set({ [ENABLED_STORAGE_KEY]: enabled });
  });

  openOptions.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  loadState();
})();
