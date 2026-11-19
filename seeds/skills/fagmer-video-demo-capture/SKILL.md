---
name: fagmer-video-demo-capture
description: Ricardo Fagmer's demo-capture stage for the AI Creator Engine. Plans and runs authorized, original screen captures of real software for a run's scenes with Playwright through `ace capture`, enforcing a host allowlist and fresh sessions. Use inside fagmer-video-producer, or when the user asks to "capture the demo", "record the tool's screen", or says "fagmer-video-demo-capture".
---

# Fagmer Video — Demo Capture

**Input:** validated `script.json`; scenes whose `visual` holds a product URL.
**Output:** `assets/<sceneId>.webm|png` and `assets.json` (written by `ace capture`).
**Hard stop:** a URL whose host is not in `CAPTURE_ALLOWED_HOSTS`; any page that needs the
user's personal login, shows personal data, keys, client accounts or confidential screens.

## Steps

1. List the capture scenes and their URLs. Only public pages, logged-out views, or a dedicated
   test account the user set up for the channel. Never reuse a personal browser session.
2. Ask the user by click to confirm the list and that the channel may show each site.
3. Make sure each host is in `CAPTURE_ALLOWED_HOSTS` in `$ENGINE/.env`; if not, ask the user to
   add it (do not edit `.env` silently), then set `PROVIDER_MEDIA=live` for this run.
4. Scenes without a URL get title cards from `fagmer-video-scene-generator`.
5. `pnpm ace capture <run>`. Then extract one frame per capture
   (`ffmpeg -ss 1 -i assets/<id>.webm -frames:v 1 /tmp/<id>.png`) and look at each: no
   cookie banners covering the UI, no personal data, the thing the narration describes is visible.
   Re-capture or switch to a title card when not.

If a site's terms forbid automated access, don't capture it: use a title card and say so.
