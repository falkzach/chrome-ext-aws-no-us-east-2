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
  await chrome.action.setBadgeText({ text: enabled ? "" : "OFF" });
  await chrome.action.setBadgeBackgroundColor({ color: "#65717d" });
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
  if (areaName === "sync" && changes[ENABLED_STORAGE_KEY]) {
    const enabled = changes[ENABLED_STORAGE_KEY].newValue !== false;

    updateBadge(enabled).catch(logRuleInstallError);

    if (enabled) {
      getStoredRules()
        .then(replaceDynamicRules)
        .catch(logRuleInstallError);
    } else {
      removeDynamicRules().catch(logRuleInstallError);
    }
  }

  if (areaName === "sync" && changes[STORAGE_KEY]) {
    const rules = changes[STORAGE_KEY].newValue;

    if (validateRules(rules).valid) {
      chrome.storage.sync.get(ENABLED_STORAGE_KEY).then((result) => {
        if (result[ENABLED_STORAGE_KEY] !== false) {
          return replaceDynamicRules(rules);
        }

        return undefined;
      }).catch(logRuleInstallError);
    }
  }
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
