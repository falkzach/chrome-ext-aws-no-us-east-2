(function () {
  "use strict";

  const { DEFAULT_RULES, ALL_DESTINATIONS } = globalThis.AwsRegionData;
  const { STORAGE_KEY, normalizeRules, validateRules } = globalThis.AwsRegionRules;

  const rulesContainer = document.getElementById("rules");
  const form = document.getElementById("rules-form");
  const status = document.getElementById("status");
  const datalist = document.getElementById("region-options");

  function setStatus(message, isError) {
    status.textContent = message;
    status.classList.toggle("error", Boolean(isError));
  }

  function populateDatalist() {
    // Catch-all default option description
    const defaultOpt = document.createElement("option");
    defaultOpt.value = "*";
    defaultOpt.textContent = "All unmatched regions (*)";
    datalist.append(defaultOpt);

    ALL_DESTINATIONS.forEach((region) => {
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
      if (matches.length > 0) {
        descSpan.textContent = `All regions starting with "${prefix}" (${matches.length} matches)`;
        descSpan.classList.remove("invalid");
      } else {
        descSpan.textContent = "No matching regions for this prefix";
        descSpan.classList.add("invalid");
      }
      return;
    }

    const found = ALL_DESTINATIONS.find((r) => r.code === value);
    if (found) {
      descSpan.textContent = found.name;
      descSpan.classList.remove("invalid");
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

    row.append(handle, fromWrapper, toWrapper, remove);
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
  }

  // Add rule click listener is now bound dynamically to the dynamically generated button in renderRules()

  document.getElementById("reset-rules").addEventListener("click", () => {
    renderRules(DEFAULT_RULES);
    setStatus("Defaults restored. Save to apply them.", false);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const validation = validateRules(collectRules());
    if (!validation.valid) {
      setStatus(validation.errors.join("\n"), true);
      return;
    }

    await chrome.storage.sync.set({ [STORAGE_KEY]: validation.rules });
    setStatus("Saved. Dynamic redirect rules have been updated.", false);
  });

  async function loadTheme() {
    const result = await chrome.storage.sync.get("theme");
    const theme = result.theme || "system";
    document.documentElement.setAttribute("data-theme", theme);
  }

  // Listen for storage changes to sync theme if changed in popup
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes.theme) {
      document.documentElement.setAttribute("data-theme", changes.theme.newValue || "system");
    }
  });

  populateDatalist();
  loadRules().catch((error) => setStatus(error.message, true));
  loadTheme().catch(console.error);
})();
