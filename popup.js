(function () {
  "use strict";

  const { ENABLED_STORAGE_KEY } = globalThis.AwsRegionRules;

  const toggle = document.getElementById("enabled-toggle");
  const stateLabel = document.getElementById("state-label");
  const stateHelp = document.getElementById("state-help");
  const openOptions = document.getElementById("open-options");
  const segments = document.querySelectorAll(".segment-btn");

  function render(enabled) {
    toggle.checked = enabled;
    stateLabel.textContent = enabled ? "Rewrites Enabled" : "Rewrites Disabled";
    stateHelp.textContent = enabled
      ? "AWS Console region redirects are active."
      : "Saved rules are paused.";
  }

  function updateThemeUI(activeTheme) {
    segments.forEach((btn) => {
      const isSelected = btn.getAttribute("data-theme-val") === activeTheme;
      btn.classList.toggle("active", isSelected);
      btn.setAttribute("aria-checked", isSelected ? "true" : "false");
    });
  }

  async function loadState() {
    // Load enabled state
    const enabledResult = await chrome.storage.sync.get(ENABLED_STORAGE_KEY);
    render(enabledResult[ENABLED_STORAGE_KEY] !== false);

    // Load theme state
    const themeResult = await chrome.storage.sync.get("theme");
    const theme = themeResult.theme || "system";
    updateThemeUI(theme);
    document.documentElement.setAttribute("data-theme", theme);
  }

  toggle.addEventListener("change", async () => {
    const enabled = toggle.checked;
    render(enabled);
    await chrome.storage.sync.set({ [ENABLED_STORAGE_KEY]: enabled });
  });

  segments.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const selectedTheme = btn.getAttribute("data-theme-val");
      updateThemeUI(selectedTheme);
      document.documentElement.setAttribute("data-theme", selectedTheme);
      await chrome.storage.sync.set({ theme: selectedTheme });
    });
  });

  openOptions.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  // Listen for storage changes to sync theme if changed in options page
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes.theme) {
      const theme = changes.theme.newValue || "system";
      updateThemeUI(theme);
      document.documentElement.setAttribute("data-theme", theme);
    }
  });

  loadState();
})();
