(function () {
  "use strict";

  const { DEFAULT_RULES, ALL_DESTINATIONS } = globalThis.AwsRegionData;
  const { STORAGE_KEY, normalizeRules, validateRules } = globalThis.AwsRegionRules;

  const rulesContainer = document.getElementById("rules");
  const form = document.getElementById("rules-form");
  const status = document.getElementById("status");
  const datalist = document.getElementById("region-options");

  let originalRulesHash = "";

  const DEFAULT_REGION_GROUPS = { core: true, optIn: true, gov: false, china: false };
  let activeRegionGroups = { ...DEFAULT_REGION_GROUPS };

  function checkChanges() {
    const currentHash = JSON.stringify(collectRules());
    const hasChanges = currentHash !== originalRulesHash;
    const saveBtn = document.querySelector("button[type='submit'].primary");
    if (saveBtn) {
      saveBtn.disabled = !hasChanges;
    }
  }

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle("error", Boolean(isError));
  }

  function populateDatalist() {
    datalist.replaceChildren();

    // Catch-all default option description
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "*";
    defaultOpt.textContent = "All unmatched regions (*)";
    datalist.append(defaultOpt);

    ALL_DESTINATIONS.filter(isRegionGroupEnabled).forEach((region) => {
      const option = document.createElement("option");
      option.value = region.code;
      option.textContent = `${region.name} (${region.code})`;
      datalist.append(option);
    });
  }

  function isTerminalPassThroughRule(rule) {
    return rule.from === "*" && rule.to === "*";
  }

  let draggingRow = null;

  function isRegionGroupEnabled(region) {
    if (!region || !region.group) return true;
    const grp = region.group;
    if (grp === "core") return activeRegionGroups.core;
    if (grp === "opt-in") return activeRegionGroups.optIn;
    if (grp === "gov") return activeRegionGroups.gov;
    if (grp === "china") return activeRegionGroups.china;
    return true;
  }

  function revalidateAllDescriptions() {
    rulesContainer.querySelectorAll(".rule-row").forEach((row) => {
      const fromInput = row.querySelector("input[name='from']");
      const fromDesc = fromInput ? fromInput.nextElementSibling : null;
      if (fromInput && fromDesc) {
        updateRegionDescription(fromInput, fromDesc, "from");
      }

      const toInput = row.querySelector("input[name='to']");
      const toDesc = toInput ? toInput.nextElementSibling : null;
      if (toInput && toDesc) {
        updateRegionDescription(toInput, toDesc, "to");
      }
    });
  }

  function updateRegionDescription(input, descSpan, type) {
    const value = input.value.trim().toLowerCase();
    if (!value) {
      descSpan.textContent = "";
      descSpan.classList.remove("invalid");
      return;
    }

    if (value === "*") {
      descSpan.textContent = type === "from" ? "All unmatched regions" : "Pass through unchanged";
      descSpan.classList.remove("invalid");
      return;
    }

    if (value.endsWith("*")) {
      const prefix = value.slice(0, -1);
      const matches = ALL_DESTINATIONS.filter((r) => r.code.startsWith(prefix));
      const enabledMatches = matches.filter(isRegionGroupEnabled);
      if (enabledMatches.length > 0) {
        descSpan.textContent = `All active regions starting with "${prefix}" (${enabledMatches.length} matches)`;
        descSpan.classList.remove("invalid");
      } else {
        descSpan.textContent = matches.length > 0
          ? `All matching regions are disabled in configs`
          : `No matching regions for this prefix`;
        descSpan.classList.add("invalid");
      }
      return;
    }

    const found = ALL_DESTINATIONS.find((r) => r.code === value);
    if (found) {
      if (isRegionGroupEnabled(found)) {
        descSpan.textContent = found.name;
        descSpan.classList.remove("invalid");
      } else {
        descSpan.textContent = `${found.name} (Region group is disabled in configs)`;
        descSpan.classList.add("invalid");
      }
    } else {
      descSpan.textContent = "Unknown region code";
      descSpan.classList.add("invalid");
    }
  }

  function createRuleRow(rule) {
    const row = document.createElement("div");
    row.className = "rule-row";
    const isTerminalRule = isTerminalPassThroughRule(rule);

    if (isTerminalRule) {
      row.classList.add("terminal-rule");
    }

    // Create drag handle or lock icon
    const handle = document.createElement("div");
    if (isTerminalRule) {
      handle.className = "drag-handle locked";
      handle.innerHTML = "🔒";
      handle.title = "This default terminal rule is locked and cannot be reordered.";
    } else {
      handle.className = "drag-handle";
      handle.innerHTML = "⋮⋮";
      handle.title = "Drag to reorder rule";

      // Enable drag only on handle mousedown/touchstart to preserve input text selection
      handle.addEventListener("mousedown", () => {
        row.setAttribute("draggable", "true");
      });
      handle.addEventListener("touchstart", () => {
        row.setAttribute("draggable", "true");
      });
    }

    const fromWrapper = document.createElement("div");
    fromWrapper.className = "input-wrapper";

    const from = document.createElement("input");
    from.name = "from";
    from.placeholder = "us-east-2, us-*, or *";
    from.setAttribute("list", "region-options");
    from.value = rule.from || "";

    const fromDesc = document.createElement("span");
    fromDesc.className = "region-desc";

    fromWrapper.append(from, fromDesc);

    from.addEventListener("input", () => updateRegionDescription(from, fromDesc, "from"));
    updateRegionDescription(from, fromDesc, "from");

    const toWrapper = document.createElement("div");
    toWrapper.className = "input-wrapper";

    const to = document.createElement("input");
    to.name = "to";
    to.placeholder = "us-east-1 or *";
    to.setAttribute("list", "region-options");
    to.value = rule.to || "";

    const toDesc = document.createElement("span");
    toDesc.className = "region-desc";

    toWrapper.append(to, toDesc);

    to.addEventListener("input", () => updateRegionDescription(to, toDesc, "to"));
    updateRegionDescription(to, toDesc, "to");

    const arrow = document.createElement("div");
    arrow.className = "routing-arrow";
    arrow.innerHTML = "➔";

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "remove-rule";
    remove.textContent = "x";
    remove.setAttribute("aria-label", isTerminalRule ? "Default pass-through rule cannot be removed" : "Remove rule");

    if (isTerminalRule) {
      remove.disabled = true;
      remove.title = "The final * -> * pass-through rule is required.";
    } else {
      remove.addEventListener("click", () => {
        row.remove();
        setStatus("", false);
        checkChanges();
      });
    }

    // Set up drag events for reordering reorderable rules
    if (!isTerminalRule) {
      row.addEventListener("dragstart", (e) => {
        draggingRow = row;
        row.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", ""); // Required for Firefox
      });

      row.addEventListener("dragend", () => {
        row.setAttribute("draggable", "false");
        row.classList.remove("dragging");
        draggingRow = null;

        // Perform instant validation after sorting
        const validation = validateRules(collectRules());
        if (!validation.valid) {
          setStatus("Rules reordered (invalid order):\n" + validation.errors.join("\n"), true);
        } else {
          setStatus("Rules reordered. Save to apply changes.", false);
        }
        checkChanges();
      });
    }

    // All rows handle dragover so draggingRow can be inserted relative to them
    row.addEventListener("dragover", (e) => {
      if (!draggingRow || draggingRow === row) {
        return;
      }
      e.preventDefault();

      if (isTerminalRule) {
        // Dragging above the locked terminal rule (and therefore above the Add Rule button)
        const addRuleBtn = rulesContainer.querySelector("#add-rule");
        if (addRuleBtn) {
          rulesContainer.insertBefore(draggingRow, addRuleBtn);
        } else {
          rulesContainer.insertBefore(draggingRow, row);
        }
      } else {
        // Dragging over another reorderable rule; swap based on vertical mouse midpoint
        const rect = row.getBoundingClientRect();
        const middle = rect.top + rect.height / 2;
        if (e.clientY < middle) {
          rulesContainer.insertBefore(draggingRow, row);
        } else {
          rulesContainer.insertBefore(draggingRow, row.nextSibling);
        }
      }
    });

    row.append(handle, fromWrapper, arrow, toWrapper, remove);
    return row;
  }

  function renderRules(rules) {
    const normalizedRules = normalizeRules(rules);

    if (!normalizedRules.some(isTerminalPassThroughRule)) {
      normalizedRules.push({ from: "*", to: "*" });
    }

    const terminalRuleIndex = normalizedRules.findIndex(isTerminalPassThroughRule);
    let reorderableRules = [];
    let terminalRule = null;

    if (terminalRuleIndex !== -1) {
      terminalRule = normalizedRules[terminalRuleIndex];
      reorderableRules = [
        ...normalizedRules.slice(0, terminalRuleIndex),
        ...normalizedRules.slice(terminalRuleIndex + 1)
      ];
    } else {
      reorderableRules = normalizedRules;
    }

    const reorderableRows = reorderableRules.map(createRuleRow);

    // Create the "Add Rewrite Rule" button dynamically
    const addRuleBtn = document.createElement("button");
    addRuleBtn.type = "button";
    addRuleBtn.id = "add-rule";
    addRuleBtn.className = "add-rule-row";
    
    const span = document.createElement("span");
    span.textContent = "+ Add Rewrite Rule";
    addRuleBtn.appendChild(span);

    addRuleBtn.addEventListener("click", () => {
      const newRow = createRuleRow({ from: "", to: "" });
      rulesContainer.insertBefore(newRow, addRuleBtn);
      setStatus("", false);
      checkChanges();
    });

    addRuleBtn.addEventListener("dragover", (e) => {
      if (!draggingRow) return;
      e.preventDefault();
      rulesContainer.insertBefore(draggingRow, addRuleBtn);
    });

    const elementsToAppend = [...reorderableRows, addRuleBtn];
    if (terminalRule) {
      elementsToAppend.push(createRuleRow(terminalRule));
    }

    rulesContainer.replaceChildren(...elementsToAppend);
  }

  function collectRules() {
    return Array.from(rulesContainer.querySelectorAll(".rule-row")).map((row) => ({
      from: row.querySelector("[name='from']").value,
      to: row.querySelector("[name='to']").value
    }));
  }

  async function loadRules() {
    const result = await chrome.storage.sync.get(STORAGE_KEY);
    renderRules(result[STORAGE_KEY] || DEFAULT_RULES);
    originalRulesHash = JSON.stringify(collectRules());
    checkChanges();
  }

  // Add rule click listener is now bound dynamically to the dynamically generated button in renderRules()

  document.getElementById("reset-rules").addEventListener("click", () => {
    renderRules(DEFAULT_RULES);
    setStatus("Defaults restored. Save to apply them.", false);
    checkChanges();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const validation = validateRules(collectRules());
    if (!validation.valid) {
      setStatus(validation.errors.join("\n"), true);
      return;
    }

    await chrome.storage.sync.set({ [STORAGE_KEY]: validation.rules });
    originalRulesHash = JSON.stringify(collectRules());
    setStatus("Saved. Dynamic rewrite rules have been updated.", false);
    checkChanges();
  });

  const enabledToggle = document.getElementById("enabled-toggle");
  const stateHelp = document.getElementById("state-help");
  const themeHelp = document.getElementById("theme-help");

  function updateEnabledUI(enabled) {
    if (enabledToggle) {
      enabledToggle.checked = enabled;
    }
    if (stateHelp) {
      stateHelp.textContent = enabled ? "Active" : "Disabled";
      stateHelp.className = enabled ? "active" : "disabled";
    }
  }

  async function loadEnabledState() {
    const result = await chrome.storage.sync.get("enabled");
    const enabled = result.hasOwnProperty("enabled") ? result.enabled : true;
    updateEnabledUI(enabled);
  }

  if (enabledToggle) {
    enabledToggle.addEventListener("change", async () => {
      const enabled = enabledToggle.checked;
      await chrome.storage.sync.set({ enabled });
      updateEnabledUI(enabled);
    });
  }

  function updateThemeUI(theme) {
    const buttons = document.querySelectorAll(".controls-panel .segment-btn");
    buttons.forEach((btn) => {
      const isActive = btn.getAttribute("data-theme-val") === theme;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-checked", isActive ? "true" : "false");
    });
    if (themeHelp) {
      themeHelp.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
    }
  }

  async function loadTheme() {
    const result = await chrome.storage.sync.get("theme");
    const theme = result.theme || "system";
    document.documentElement.setAttribute("data-theme", theme);
    updateThemeUI(theme);
  }

  // Wire up theme segmented buttons click handlers
  document.querySelectorAll(".controls-panel .segment-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const val = btn.getAttribute("data-theme-val");
      await chrome.storage.sync.set({ theme: val });
      document.documentElement.setAttribute("data-theme", val);
      updateThemeUI(val);
    });
  });

  // Listen for storage changes to sync theme/enabled/regionGroups if changed in popup or other tabs
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync") {
      if (changes.theme) {
        const newTheme = changes.theme.newValue || "system";
        document.documentElement.setAttribute("data-theme", newTheme);
        updateThemeUI(newTheme);
      }
      if (changes.enabled) {
        updateEnabledUI(changes.enabled.newValue);
      }
      if (changes.regionGroups) {
        activeRegionGroups = { ...DEFAULT_REGION_GROUPS, ...changes.regionGroups.newValue };
        updateRegionGroupsUI(activeRegionGroups);
        populateDatalist();
        revalidateAllDescriptions();
      }
    }
  });

  // === Region Groups Visibility Controller ===

  const regionGroupToggles = {
    core: document.getElementById("group-core"),
    optIn: document.getElementById("group-opt-in"),
    gov: document.getElementById("group-gov"),
    china: document.getElementById("group-china")
  };

  function updateRegionGroupsUI(groups) {
    if (regionGroupToggles.core) regionGroupToggles.core.checked = groups.core;
    if (regionGroupToggles.optIn) regionGroupToggles.optIn.checked = groups.optIn;
    if (regionGroupToggles.gov) regionGroupToggles.gov.checked = groups.gov;
    if (regionGroupToggles.china) regionGroupToggles.china.checked = groups.china;
  }

  async function loadRegionGroups() {
    const result = await chrome.storage.sync.get("regionGroups");
    activeRegionGroups = { ...DEFAULT_REGION_GROUPS, ...result.regionGroups };
    updateRegionGroupsUI(activeRegionGroups);
  }

  async function onRegionGroupToggle() {
    activeRegionGroups = {
      core: regionGroupToggles.core ? regionGroupToggles.core.checked : true,
      optIn: regionGroupToggles.optIn ? regionGroupToggles.optIn.checked : true,
      gov: regionGroupToggles.gov ? regionGroupToggles.gov.checked : false,
      china: regionGroupToggles.china ? regionGroupToggles.china.checked : false
    };
    await chrome.storage.sync.set({ regionGroups: activeRegionGroups });
    populateDatalist();
    revalidateAllDescriptions();
  }

  Object.values(regionGroupToggles).forEach((toggle) => {
    if (toggle) toggle.addEventListener("change", onRegionGroupToggle);
  });

  // === Initialization ===

  loadRegionGroups()
    .then(() => {
      populateDatalist();
      return loadRules();
    })
    .catch((error) => setStatus(error.message, true));
  loadTheme().catch(console.error);
  loadEnabledState().catch(console.error);
  rulesContainer.addEventListener("input", checkChanges);
})();
