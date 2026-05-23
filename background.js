importScripts("regions.js", "ruleEngine.js");

const { DEFAULT_RULES } = globalThis.AwsRegionData;
const {
  STORAGE_KEY,
  ENABLED_STORAGE_KEY,
  validateRules,
  buildDynamicRules
} = globalThis.AwsRegionRules;

async function getStoredRules() {
  const result = await chrome.storage.sync.get(STORAGE_KEY);
  return result[STORAGE_KEY] || DEFAULT_RULES;
}

/**
 * Replace all existing dynamic DNR rules with freshly generated ones.
 * Rule IDs are deterministic from RULE_ID_START and re-generated on every save.
 * ensureRulesInstalled() cleans up all dynamic rules on startup as a safety net.
 */
async function replaceDynamicRules(rules) {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules.map((rule) => rule.id);
  const addRules = buildDynamicRules(rules);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });
}

async function removeDynamicRules() {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existingRules.map((rule) => rule.id);

  if (removeRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
  }
}

async function updateBadge(enabled) {
  // Remove badge text completely
  await chrome.action.setBadgeText({ text: "" });

  // Dynamically swap between colored and desaturated off-icons
  const suffix = enabled ? "" : "_off";
  await chrome.action.setIcon({
    path: {
      "16": `icon16${suffix}.png`,
      "32": `icon32${suffix}.png`,
      "48": `icon48${suffix}.png`,
      "128": `icon128${suffix}.png`
    }
  });
}

async function ensureRulesInstalled() {
  const result = await chrome.storage.sync.get([STORAGE_KEY, ENABLED_STORAGE_KEY]);
  let rules = result[STORAGE_KEY] || DEFAULT_RULES;
  const enabled = result[ENABLED_STORAGE_KEY] !== false;

  if (!validateRules(rules).valid) {
    rules = DEFAULT_RULES;
  }

  const storageUpdates = {};
  if (!result[STORAGE_KEY] || rules === DEFAULT_RULES) {
    storageUpdates[STORAGE_KEY] = rules;
  }

  if (typeof result[ENABLED_STORAGE_KEY] !== "boolean") {
    storageUpdates[ENABLED_STORAGE_KEY] = true;
  }

  if (Object.keys(storageUpdates).length > 0) {
    await chrome.storage.sync.set(storageUpdates);
  }

  await updateBadge(enabled);

  if (enabled) {
    await replaceDynamicRules(rules);
  } else {
    await removeDynamicRules();
  }
}

function logRuleInstallError(error) {
  console.error("Failed to install AWS region rewrite rules:", error);
}

chrome.runtime.onInstalled.addListener(() => {
  ensureRulesInstalled().catch(logRuleInstallError);
});

chrome.runtime.onStartup.addListener(() => {
  ensureRulesInstalled().catch(logRuleInstallError);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;

  const enabledChanged = ENABLED_STORAGE_KEY in changes;
  const rulesChanged = STORAGE_KEY in changes;

  if (!enabledChanged && !rulesChanged) return;

  const enabledPromise = enabledChanged
    ? Promise.resolve(changes[ENABLED_STORAGE_KEY].newValue !== false)
    : chrome.storage.sync.get(ENABLED_STORAGE_KEY)
        .then((r) => r[ENABLED_STORAGE_KEY] !== false);

  enabledPromise.then((enabled) => {
    updateBadge(enabled);

    if (!enabled) return removeDynamicRules();

    if (rulesChanged && validateRules(changes[STORAGE_KEY].newValue).valid) {
      return replaceDynamicRules(changes[STORAGE_KEY].newValue);
    }

    if (enabledChanged) {
      return getStoredRules().then(replaceDynamicRules);
    }
  }).catch(logRuleInstallError);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "previewRules") {
    getStoredRules()
      .then((rules) => sendResponse({ ok: true, rules: buildDynamicRules(rules) }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});
