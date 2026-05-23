/**
 * Rule engine for AWS Console region redirect rules.
 *
 * Validates user-defined ACL-style rules, detects redirect cycles (DAG
 * enforcement), enforces cross-partition restrictions, and generates
 * Chrome declarativeNetRequest dynamic redirect rules.
 */
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

  /**
   * Map a region group name to its AWS partition.
   * Core and opt-in regions share the commercial partition.
   * GovCloud and China are isolated partitions.
   */
  const PARTITION_BY_GROUP = {
    "core": "aws",
    "opt-in": "aws",
    "gov": "aws-us-gov",
    "china": "aws-cn"
  };

  /**
   * Look up the AWS partition for a region code.
   * Returns the partition string or "aws" as a safe default.
   * @param {string} code - Region code (e.g. "us-east-1", "cn-north-1")
   * @returns {string}
   */
  function partitionOf(code) {
    const region = destinationByCode.get(code) || sourceByCode.get(code);
    if (!region || !region.group) return "aws";
    return PARTITION_BY_GROUP[region.group] || "aws";
  }

  /**
   * Coerce raw rule data into a normalized array of { from, to } objects.
   * Returns a copy of DEFAULT_RULES if the input is not a valid array.
   * Each field is trimmed, lowercased, and coerced to a string.
   *
   * @param {*} rules - Raw rules from storage or user input
   * @returns {Array<{from: string, to: string}>}
   */
  function normalizeRules(rules) {
    if (!Array.isArray(rules)) {
      return DEFAULT_RULES.map((rule) => ({ ...rule }));
    }

    return rules.slice(0, MAX_RULES + 1).map((rule) => ({
      from: String(rule.from || "").trim().toLowerCase(),
      to: String(rule.to || "").trim().toLowerCase()
    }));
  }

  /**
   * Validate a rule set for correctness.
   *
   * Checks performed:
   * - At least one rule is required
   * - Rule count does not exceed MAX_RULES
   * - Both from and to fields are present and within length limits
   * - Source patterns are valid (exact region, prefix wildcard, or *)
   * - Destination is a known region or * (pass-through)
   * - No duplicate from values
   * - Wildcard (*) from rule must be last
   * - Source-specific pass-through rules are redundant
   * - Self-redirect rules are rejected
   * - Fully shadowed rules are rejected
   * - Cross-partition redirects (gov/china ↔ commercial) are rejected
   * - Redirect cycles are detected (DAG enforcement)
   *
   * @param {*} rawRules - Raw rules from storage or user input
   * @returns {{ valid: boolean, errors: string[], rules: Array<{from: string, to: string}> }}
   */
  function validateRules(rawRules) {
    // Check raw rule count before normalization to catch overflow
    if (Array.isArray(rawRules) && rawRules.length > MAX_RULES) {
      return {
        valid: false,
        errors: [`Too many rules (${rawRules.length}). The maximum is ${MAX_RULES}.`],
        rules: []
      };
    }

    const rules = normalizeRules(rawRules).filter((rule) => rule.from || rule.to);
    const errors = [];
    const seenFrom = new Set();
    const claimedSources = new Map();
    let wildcardIndex = -1;

    if (rules.length === 0) {
      errors.push("At least one rule is required. Use * -> * to pass everything through.");
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

      // Cross-partition check: reject redirects between isolated partitions
      if (rule.to !== "*" && rule.from !== "*" && destinationByCode.has(rule.to)) {
        const sourceCodes = matchingSourceCodes(rule.from);
        const toPartition = partitionOf(rule.to);
        for (const code of sourceCodes) {
          const fromPartition = partitionOf(code);
          if (fromPartition !== toPartition) {
            errors.push(
              `Row ${row}: cannot redirect across AWS partitions ` +
              `("${code}" is ${fromPartition}, "${rule.to}" is ${toPartition}).`
            );
            break;
          }
        }
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

    // DAG enforcement: detect redirect cycles in the expanded rule graph.
    // Only run if no prior errors — cycle detection assumes structurally valid rules.
    if (errors.length === 0) {
      const cycleResult = detectCycles(rules);
      if (cycleResult.hasCycle) {
        errors.push(
          `Redirect cycle detected: "${cycleResult.path.join('" → "')}" → "${cycleResult.path[0]}". ` +
          "Rules must form a DAG (no circular redirect chains)."
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      rules
    };
  }

  /**
   * Detect redirect cycles in the expanded concrete redirect graph.
   *
   * Builds an adjacency map by expanding all source patterns (including
   * wildcards) to concrete region codes, respecting first-match claiming
   * order. Then performs DFS to find any cycle.
   *
   * @param {Array<{from: string, to: string}>} rules - Normalized, validated rules
   * @returns {{ hasCycle: boolean, path?: string[] }}
   */
  function detectCycles(rules) {
    // Build adjacency list: fromCode -> toCode (concrete, single-hop edges)
    const edges = new Map();
    const claimedSources = new Set();

    for (const rule of rules) {
      if (rule.to === "*") continue;

      const codes = matchingSourceCodes(rule.from);
      for (const fromCode of codes) {
        if (!claimedSources.has(fromCode) && fromCode !== rule.to) {
          edges.set(fromCode, rule.to);
          claimedSources.add(fromCode);
        }
      }
    }

    // DFS cycle detection — follow redirect chains from every source node
    const visited = new Set();

    for (const start of edges.keys()) {
      if (visited.has(start)) continue;

      // Walk the chain from this start node. Since each node has at most
      // one outgoing edge (single destination per source), this is a
      // simple linked-list traversal with a tortoise-and-hare-style check.
      const path = [];
      const inPath = new Set();
      let current = start;

      while (current && !visited.has(current)) {
        if (inPath.has(current)) {
          // Found a cycle — extract the cycle portion of the path
          const cycleStart = path.indexOf(current);
          return { hasCycle: true, path: path.slice(cycleStart) };
        }

        inPath.add(current);
        path.push(current);
        current = edges.get(current) || null;
      }

      // Mark all nodes in this chain as visited (they're acyclic)
      for (const node of path) {
        visited.add(node);
      }
    }

    return { hasCycle: false };
  }

  /** @param {string} value */
  function isPrefixWildcard(value) {
    return value.length > 1 && value.endsWith("*");
  }

  /**
   * Check whether a value is a valid source pattern.
   * Accepts exact region codes, prefix wildcards (e.g. "us-*"), or "*".
   * @param {string} value
   * @returns {boolean}
   */
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

  /**
   * Expand a source pattern to a list of concrete region codes.
   * @param {string} pattern - Source pattern ("*", exact code, or prefix wildcard)
   * @returns {string[]}
   */
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

  /**
   * Escape a region code for use in a Chrome declarativeNetRequest regexFilter.
   * Input must have already been validated against the known region maps.
   * This provides defense-in-depth — region codes should only contain [a-z0-9-].
   * @param {string} value - A validated region code
   * @returns {string}
   */
  function escapeRegex(value) {
    if (!/^[a-z0-9.-]+$/.test(value)) {
      throw new Error(`Unexpected characters in region value: "${value}"`);
    }
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /** @param {object} toRegion @param {boolean} includeHost */
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

  /**
   * Build Chrome declarativeNetRequest dynamic redirect rules from raw user rules.
   * Validates the rules first and throws if validation fails.
   *
   * Rule IDs are deterministic starting from RULE_ID_START and re-generated
   * on every save. ensureRulesInstalled() cleans up all dynamic rules on
   * startup as a safety net against orphaned rules.
   *
   * @param {*} rawRules - Raw rules from storage or user input
   * @returns {object[]} Array of Chrome DNR rule objects
   * @throws {Error} If rules fail validation
   */
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
    buildDynamicRules
  };
})();
