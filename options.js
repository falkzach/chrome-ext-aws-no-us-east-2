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
    ["*"].concat(ALL_DESTINATIONS.map((region) => region.code)).forEach((code) => {
      const option = document.createElement("option");
      option.value = code;
      datalist.append(option);
    });
  }

  function isTerminalPassThroughRule(rule) {
    return rule.from === "*" && rule.to === "*";
  }

  function createRuleRow(rule) {
    const row = document.createElement("div");
    row.className = "rule-row";
    const isTerminalRule = isTerminalPassThroughRule(rule);

    if (isTerminalRule) {
      row.classList.add("terminal-rule");
    }

    const from = document.createElement("input");
    from.name = "from";
    from.placeholder = "us-east-2, us-*, or *";
    from.setAttribute("list", "region-options");
    from.value = rule.from || "";

    const to = document.createElement("input");
    to.name = "to";
    to.placeholder = "us-east-1 or *";
    to.setAttribute("list", "region-options");
    to.value = rule.to || "";

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

    row.append(from, to, remove);
    return row;
  }

  function renderRules(rules) {
    const normalizedRules = normalizeRules(rules);

    if (!normalizedRules.some(isTerminalPassThroughRule)) {
      normalizedRules.push({ from: "*", to: "*" });
    }

    rulesContainer.replaceChildren(...normalizedRules.map(createRuleRow));
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

  document.getElementById("add-rule").addEventListener("click", () => {
    const terminalRule = rulesContainer.querySelector(".terminal-rule");
    const newRow = createRuleRow({ from: "", to: "" });

    if (terminalRule) {
      rulesContainer.insertBefore(newRow, terminalRule);
    } else {
      rulesContainer.append(newRow);
    }
    setStatus("", false);
  });

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

  populateDatalist();
  loadRules().catch((error) => setStatus(error.message, true));
})();
