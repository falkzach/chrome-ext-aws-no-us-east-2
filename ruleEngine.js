(function () {
  "use strict";

  const {
    DEFAULT_RULES,
    REGIONS,
    PSEUDO_REGIONS,
    ALL_DESTINATIONS
  } = globalThis.AwsRegionData;

  const STORAGE_KEY = "regionRules";
  const ENABLED_STORAGE_KEY = "enabled";
  const RULE_ID_START = 1000;
  const MAX_RULES = REGIONS.length + PSEUDO_REGIONS.length + 1;
  const MAX_REGION_CODE_LENGTH = 32;
  const destinationByCode = new Map(ALL_DESTINATIONS.map((region) => [region.code, region]));
  const sourceByCode = new Map(REGIONS.concat(PSEUDO_REGIONS).map((region) => [region.code, region]));
  const sourceRegions = REGIONS.concat(PSEUDO_REGIONS);

  function normalizeRules(rules) {
    if (!Array.isArray(rules)) {
      return DEFAULT_RULES.map((rule) => ({ ...rule }));
    }

    return rules.slice(0, MAX_RULES + 1).map((rule) => ({
      from: String(rule.from || "").trim().toLowerCase(),
      to: String(rule.to || "").trim().toLowerCase()
    }));
  }

  function validateRules(rawRules) {
    const rules = normalizeRules(rawRules).filter((rule) => rule.from || rule.to);
    const errors = [];
    const seenFrom = new Set();
    const claimedSources = new Map();
    let wildcardIndex = -1;

    if (rules.length === 0) {
      errors.push("At least one rule is required. Use * -> * to pass everything through.");
    }

    if (rules.length > MAX_RULES) {
      errors.push(`Too many rules. The maximum is ${MAX_RULES}.`);
    }

    rules.forEach((rule, index) => {
      const row = index + 1;

      if (!rule.from || !rule.to) {
        errors.push(`Row ${row}: both from and to are required.`);
        return;
      }

      if (rule.from.length > MAX_REGION_CODE_LENGTH || rule.to.length > MAX_REGION_CODE_LENGTH) {
        errors.push(`Row ${row}: region values are too long.`);
        return;
      }

      if (!isValidSourcePattern(rule.from)) {
        errors.push(`Row ${row}: "${rule.from}" is not a supported AWS Console region.`);
      }

      if (rule.to !== "*" && !destinationByCode.has(rule.to)) {
        errors.push(`Row ${row}: "${rule.to}" is not a supported AWS Console destination.`);
      }

      if (seenFrom.has(rule.from)) {
        errors.push(`Row ${row}: duplicate from value "${rule.from}".`);
      }
      seenFrom.add(rule.from);

      if (rule.from === "*") {
        wildcardIndex = index;
      }

      if (rule.from !== "*" && rule.to === "*") {
        errors.push(`Row ${row}: source-specific pass-through rules are redundant; remove the row instead.`);
      }

      if (rule.from !== "*" && rule.from === rule.to) {
        errors.push(`Row ${row}: from and to cannot be the same region.`);
      }

      const matches = matchingSourceCodes(rule.from);
      const unclaimedMatches = matches.filter((code) => !claimedSources.has(code));

      if (rule.from !== "*" && matches.length > 0 && unclaimedMatches.length === 0) {
        errors.push(`Row ${row}: "${rule.from}" is fully shadowed by earlier source rules.`);
      }

      matches.forEach((code) => {
        if (!claimedSources.has(code)) {
          claimedSources.set(code, row);
        }
      });
    });

    if (wildcardIndex !== -1 && wildcardIndex !== rules.length - 1) {
      errors.push("The wildcard from rule must be last because it is the default for unmatched regions.");
    }

    return {
      valid: errors.length === 0,
      errors,
      rules
    };
  }

  function isPrefixWildcard(value) {
    return value.length > 1 && value.endsWith("*");
  }

  function isValidSourcePattern(value) {
    if (value === "*") {
      return true;
    }

    if (sourceByCode.has(value)) {
      return true;
    }

    if (!isPrefixWildcard(value)) {
      return false;
    }

    const prefix = value.slice(0, -1);
    return /^[a-z]{2}(?:-[a-z]+)*-$/.test(prefix) && matchingSourceCodes(value).length > 0;
  }

  function matchingSourceCodes(pattern) {
    if (pattern === "*") {
      return sourceRegions.map((region) => region.code);
    }

    if (sourceByCode.has(pattern)) {
      return [pattern];
    }

    if (!isPrefixWildcard(pattern)) {
      return [];
    }

    const prefix = pattern.slice(0, -1);
    return sourceRegions
      .map((region) => region.code)
      .filter((code) => code.startsWith(prefix));
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function makeRedirectAction(toRegion, includeHost) {
    const transform = {
      queryTransform: {
        removeParams: ["region"],
        addOrReplaceParams: [{ key: "region", value: toRegion.code }]
      }
    };

    if (includeHost && toRegion.consoleHost) {
      transform.host = toRegion.consoleHost;
    }

    return {
      type: "redirect",
      redirect: { transform }
    };
  }

  function makeQueryRule(id, fromCode, toRegion, priority) {
    return {
      id,
      priority,
      action: makeRedirectAction(toRegion, false),
      condition: {
        regexFilter: `^[^#]*[?&]region=${escapeRegex(fromCode)}([&#]|$)`,
        resourceTypes: ["main_frame"]
      }
    };
  }

  function makeHostRule(id, fromRegion, toRegion, priority) {
    return {
      id,
      priority,
      action: makeRedirectAction(toRegion, true),
      condition: {
        regexFilter: `^https://${escapeRegex(fromRegion.consoleHost)}/.*`,
        resourceTypes: ["main_frame"]
      }
    };
  }

  function buildDynamicRules(rawRules) {
    const validation = validateRules(rawRules);
    if (!validation.valid) {
      throw new Error(validation.errors.join("\n"));
    }

    const claimedSources = new Set();
    const dnrRules = [];
    let id = RULE_ID_START;

    function addRedirectPair(fromCode, toCode, priority) {
      const fromRegion = sourceByCode.get(fromCode);
      const toRegion = destinationByCode.get(toCode);

      if (!fromRegion || !toRegion || fromCode === toCode) {
        return;
      }

      if (fromRegion.consoleHost && toRegion.consoleHost) {
        dnrRules.push(makeHostRule(id++, fromRegion, toRegion, priority + 1));
      }
      dnrRules.push(makeQueryRule(id++, fromCode, toRegion, priority));
    }

    validation.rules.forEach((rule) => {
      if (rule.from === "*" && rule.to === "*") {
        return;
      }

      matchingSourceCodes(rule.from).forEach((fromCode) => {
        if (!claimedSources.has(fromCode)) {
          const priority = rule.from === "*" ? 10 : isPrefixWildcard(rule.from) ? 50 : 100;
          addRedirectPair(fromCode, rule.to, priority);
          claimedSources.add(fromCode);
        }
      });
    });

    return dnrRules;
  }

  globalThis.AwsRegionRules = {
    STORAGE_KEY,
    ENABLED_STORAGE_KEY,
    RULE_ID_START,
    normalizeRules,
    validateRules,
    matchingSourceCodes,
    buildDynamicRules
  };
})();
