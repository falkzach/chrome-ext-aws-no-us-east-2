# AWS Console Region Rewriter

A lightweight Chrome extension (Manifest V3) that automatically rewrites AWS Management Console URLs from **us-east-2** to **us-east-1**.  
Because sometimes Amazon just defaults to the wrong place 🤢.

## 🎥 Demo  
[![Demo Video](https://img.youtube.com/vi/PFGHPuGjH3s/0.jpg)](https://www.youtube.com/watch?v=PFGHPuGjH3s)  
Watch it in action:  
https://www.youtube.com/watch?v=PFGHPuGjH3s

## Features
- Redirects any `?region=us-east-2` query parameter to `?region=us-east-1`.
- Rewrites `us-east-2.console.aws.amazon.com` subdomains to `us-east-1.console.aws.amazon.com`.
- Runs with static Declarative Net Request rules (no background scripts).
- Limited host scope: only touches `console.aws.amazon.com`.

## Installation (Dev Mode)
1. Clone this repo.  
2. Open `chrome://extensions/` in Chrome.  
3. Enable **Developer Mode**.  
4. Click **Load unpacked** and select this folder.

## Permissions
- **Declarative Net Request** – used to apply redirect rules efficiently.  
- **Host permission** for `https://*.console.aws.amazon.com/*` – limits scope to AWS Console pages.

## License
MIT
