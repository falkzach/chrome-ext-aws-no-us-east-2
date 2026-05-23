/**
 * AWS Console region data.
 * Source: https://docs.aws.amazon.com/general/latest/gr/rande.html
 * Last updated: 2026-05-23
 */
(function () {
  "use strict";

  const DEFAULT_RULES = [
    { from: "us-east-2", to: "us-east-1" },
    { from: "*", to: "*" }
  ];

  const REGIONS = [
    ["us-east-2", "US East (Ohio)", "us-east-2.console.aws.amazon.com", "core"],
    ["us-east-1", "US East (N. Virginia)", "us-east-1.console.aws.amazon.com", "core"],
    ["us-west-1", "US West (N. California)", "us-west-1.console.aws.amazon.com", "core"],
    ["us-west-2", "US West (Oregon)", "us-west-2.console.aws.amazon.com", "core"],
    ["af-south-1", "Africa (Cape Town)", "af-south-1.console.aws.amazon.com", "opt-in"],
    ["ap-east-1", "Asia Pacific (Hong Kong)", "ap-east-1.console.aws.amazon.com", "opt-in"],
    ["ap-south-2", "Asia Pacific (Hyderabad)", "ap-south-2.console.aws.amazon.com", "opt-in"],
    ["ap-southeast-3", "Asia Pacific (Jakarta)", "ap-southeast-3.console.aws.amazon.com", "opt-in"],
    ["ap-southeast-5", "Asia Pacific (Malaysia)", "ap-southeast-5.console.aws.amazon.com", "opt-in"],
    ["ap-southeast-4", "Asia Pacific (Melbourne)", "ap-southeast-4.console.aws.amazon.com", "opt-in"],
    ["ap-south-1", "Asia Pacific (Mumbai)", "ap-south-1.console.aws.amazon.com", "core"],
    ["ap-southeast-6", "Asia Pacific (New Zealand)", "ap-southeast-6.console.aws.amazon.com", "opt-in"],
    ["ap-northeast-3", "Asia Pacific (Osaka)", "ap-northeast-3.console.aws.amazon.com", "core"],
    ["ap-northeast-2", "Asia Pacific (Seoul)", "ap-northeast-2.console.aws.amazon.com", "core"],
    ["ap-southeast-1", "Asia Pacific (Singapore)", "ap-southeast-1.console.aws.amazon.com", "core"],
    ["ap-southeast-2", "Asia Pacific (Sydney)", "ap-southeast-2.console.aws.amazon.com", "core"],
    ["ap-east-2", "Asia Pacific (Taipei)", "ap-east-2.console.aws.amazon.com", "opt-in"],
    ["ap-southeast-7", "Asia Pacific (Thailand)", "ap-southeast-7.console.aws.amazon.com", "opt-in"],
    ["ap-northeast-1", "Asia Pacific (Tokyo)", "ap-northeast-1.console.aws.amazon.com", "core"],
    ["ca-central-1", "Canada (Central)", "ca-central-1.console.aws.amazon.com", "core"],
    ["ca-west-1", "Canada West (Calgary)", "ca-west-1.console.aws.amazon.com", "opt-in"],
    ["eu-central-1", "Europe (Frankfurt)", "eu-central-1.console.aws.amazon.com", "core"],
    ["eu-west-1", "Europe (Ireland)", "eu-west-1.console.aws.amazon.com", "core"],
    ["eu-west-2", "Europe (London)", "eu-west-2.console.aws.amazon.com", "core"],
    ["eu-south-1", "Europe (Milan)", "eu-south-1.console.aws.amazon.com", "opt-in"],
    ["eu-west-3", "Europe (Paris)", "eu-west-3.console.aws.amazon.com", "core"],
    ["eu-south-2", "Europe (Spain)", "eu-south-2.console.aws.amazon.com", "opt-in"],
    ["eu-north-1", "Europe (Stockholm)", "eu-north-1.console.aws.amazon.com", "core"],
    ["eu-central-2", "Europe (Zurich)", "eu-central-2.console.aws.amazon.com", "opt-in"],
    ["il-central-1", "Israel (Tel Aviv)", "il-central-1.console.aws.amazon.com", "opt-in"],
    ["mx-central-1", "Mexico (Central)", "mx-central-1.console.aws.amazon.com", "opt-in"],
    ["me-south-1", "Middle East (Bahrain)", "me-south-1.console.aws.amazon.com", "opt-in"],
    ["me-central-1", "Middle East (UAE)", "me-central-1.console.aws.amazon.com", "opt-in"],
    ["sa-east-1", "South America (Sao Paulo)", "sa-east-1.console.aws.amazon.com", "core"],
    ["us-gov-east-1", "AWS GovCloud (US-East)", "us-gov-east-1.console.amazonaws-us-gov.com", "gov"],
    ["us-gov-west-1", "AWS GovCloud (US-West)", "us-gov-west-1.console.amazonaws-us-gov.com", "gov"],
    ["cn-north-1", "China (Beijing)", "cn-north-1.console.amazonaws.cn", "china"],
    ["cn-northwest-1", "China (Ningxia)", "cn-northwest-1.console.amazonaws.cn", "china"]
  ].map(([code, name, consoleHost, group]) => ({ code, name, consoleHost, group }));

  const PSEUDO_REGIONS = [
    { code: "global", name: "Global", consoleHost: "console.aws.amazon.com", group: "core" },
    { code: "aws-global", name: "AWS Global", consoleHost: "console.aws.amazon.com", group: "core" }
  ];

  globalThis.AwsRegionData = {
    DEFAULT_RULES,
    REGIONS,
    PSEUDO_REGIONS,
    ALL_DESTINATIONS: REGIONS.concat(PSEUDO_REGIONS)
  };
})();
