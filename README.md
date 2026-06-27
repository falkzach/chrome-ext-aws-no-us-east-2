# AWS Console Region Rewriter

A lightweight Chrome extension (Manifest V3) that rewrites AWS Management Console URLs using configurable ACL-style region rules.

## 🎥 Demo  
[![Demo Video](https://img.youtube.com/vi/ljbeM1aiUdc/0.jpg)](https://www.youtube.com/watch?v=ljbeM1aiUdc)  
Watch it in action:  
https://www.youtube.com/watch?v=ljbeM1aiUdc

## Features
- Defaults to `us-east-2 -> us-east-1` and `* -> *`.
- Supports first-match rules such as `us-east-1 -> us-east-2`, `us-* -> us-east-1`, `* -> us-east-1`, and `* -> *`.
- Validates rule inputs before saving.
- Supports commercial AWS Console regions, AWS GovCloud, AWS China console regions, and global pseudo-regions.
- Uses Manifest V3 dynamic Declarative Net Request rules generated from saved options.
- Limited host scope: only touches AWS Console hosts.

## Rule Semantics
- `specific -> specific` rewrites that source region to the target region.
- `prefix-* -> specific` rewrites otherwise unmatched known source regions with that prefix to the target region, such as `us-west-* -> us-east-1`.
- `* -> specific` rewrites any otherwise unmatched supported region to the target region.
- `* -> *` leaves unmatched regions unchanged and should be the final rule.
- Rules are first-match; more-specific source rules should be placed before broader wildcard rules.
- Destination wildcards other than `*` are rejected because there is no guaranteed one-to-one mapping between region families.
- Duplicate `from` values, invalid regions, redirect loops, fully shadowed rules, and redundant source-specific pass-through rules are rejected.
- Rule inputs are normalized, allowlisted, length-limited, and regex-escaped before dynamic redirect rules are generated.

## Installation

Install on the [Chrome Web Store: AWS Region Rewriter](https://chromewebstore.google.com/detail/aws-region-rewriter/ijbgcdmmdamccimlgoekincdbhnmoecj).

## Installation (Dev Mode)
1. Clone this repo.  
2. Open `chrome://extensions/` in Chrome.
3. Enable **Developer Mode**.  
4. Click **Load unpacked** and select this folder.
5. Open the extension options page to edit region ACLs.

## Permissions
- **Declarative Net Request** – used to apply redirect rules efficiently.
- **Storage** – used to save configured ACL rules.
- **Host permissions** for AWS Console domains – limits scope to AWS Console pages.

## License
MIT
