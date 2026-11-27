---
name: 2026-11-25-reference-video-platforms
status: active
owner: ricardo
spec: n/a — fast change chosen by the developer; extends the existing allowlist parser (docs/specs/2026-11-24-link-reference-analysis-design.md) with more platforms, no new behavior shape
domain: frontend
security_review: pending
risk: high
new_feature: false
release: false
---

## What
Reference video links now accept Vimeo, Dailymotion, Facebook (videos, watch links, reels), X (Twitter) posts and Twitch (clips, past broadcasts) besides Instagram, YouTube and TikTok, each with its official embed.

## Why
The developer asked that the References link box accept every link that shows a video, not only Instagram, YouTube and TikTok.

## Scope
- packages/shared/src/catalog/video-post.ts: one shared allowlist parser for 8 platforms, canonical URLs, `videoPostKey`.
- packages/shared/src/asset-jobs/asset-job.ts: egress provider enum gains the 5 platforms.
- apps/web/src/features/catalog/video-link.ts: re-exports the shared parser; embed URL and shape per platform.
- apps/web/src/features/catalog/components/VideoEmbed.tsx: Twitch `parent` host read in the browser.
- apps/web/src/lib/bff/video-thumbnail.ts: Vimeo (oEmbed) and Dailymotion thumbnails; placeholder for Facebook, X and Twitch; host allowlist extended.
- apps/web/src/features/catalog/reference-link-draft.ts: asset id prefixes.
- apps/web/src/messages/catalog/{en,es,pt-BR}.ts: placeholder, help, unsupported, platforms, linkOnly.
- Comments: middleware.ts, miniaturas route, reference-post.ts, core asset-job-policy.ts.

## Checklist
- [x] Shared parser with strict host and id rules per platform
- [x] Web embeds and shapes
- [x] Thumbnails with host allowlist on every redirect hop
- [x] Messages in 3 locales
- [x] Egress provider enum
- [ ] Typecheck web, shared, core, watcher (final gate)
- [ ] Verify each platform in the References link box in Chrome

## What was made
<filled on completion>

## Not done
- Kwai: no official embed and uncertain yt-dlp support.
- Direct `.mp4` links on any host: would let the server fetch arbitrary hosts (SSRF).

## User checklist
- [ ] Approve the final typecheck
- [ ] Security review of the widened server-side fetch (thumbnails, yt-dlp download) before PR

## Verification
[validation] pending — final-stage user approval required (developer chose "Skip for now" on 2026-11-25: typecheck and Chrome walk not run)

## Human decisions
- 2026-11-25 | ricardo | approach | approved | "Add more platforms" (fixed allowlist, other sites stay rejected)
- 2026-11-25 | ricardo | planning | approved | "Fast change (supervisor)"

## Changes registered
<filled on completion>

## Notes
Security model unchanged: untrusted text parsed with `URL`, exact host allowlist, strict id regexes, canonical URL rebuilt from parsed parts. The thumbnail fetch only reaches vimeo.com, i.vimeocdn.com, www.dailymotion.com and *.dmcdn.net beyond the earlier hosts.
