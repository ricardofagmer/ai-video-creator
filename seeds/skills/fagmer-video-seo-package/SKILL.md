---
name: fagmer-video-seo-package
description: Ricardo Fagmer's SEO-package stage for the AI Creator Engine. Writes the TikTok title, caption, 3–8 hashtags, CTA and the AI/affiliate disclosures for a run, truthful and matched to the verified claims; the result goes into editorial.json. Use inside fagmer-video-producer or fagmer-video-quality-gate, or when the user asks for "caption and hashtags", "TikTok SEO", or says "fagmer-video-seo-package".
---

# Fagmer Video — SEO Package

**Input:** validated `script.json`, `claims.json`. **Output:** the `seo` object of
`editorial.json` (`SeoPackageSchema`).
**Hard stop:** deceptive metadata: a title or caption that promises more than the video shows,
a claim not in `claims.json`, a missing disclosure.

## Steps

1. `title` ≤ 100 chars, the outcome in plain words. `caption` opens with the same promise as
   the hook, lists the steps in one or two lines, ends with the CTA.
2. `hashtags`: 3–8, each `#Word` with no spaces; mix one broad (`#AItools`), two topic and one
   niche tag. No trending tags unrelated to the video.
3. `disclosures` always include "AI-generated voice" (or "AI-assisted"), plus "Affiliate link"
   when the CTA points to an affiliate offer, matching TikTok's AI-generated content guidance.
4. Offer the package in chat; the user edits or approves by click before it's written.
