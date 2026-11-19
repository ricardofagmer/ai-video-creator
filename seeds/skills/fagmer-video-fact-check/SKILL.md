---
name: fagmer-video-fact-check
description: Ricardo Fagmer's video fact-check stage for the AI Creator Engine. Turns a run's research into a claim-to-evidence manifest (claims.json): every material claim gets a quote from a source opened with WebFetch, or is marked unsupported and blocks the video. No Claude API. Use inside fagmer-video-producer, or when the user asks to "fact-check the video", "verify the claims", or says "fagmer-video-fact-check".
---

# Fagmer Video — Fact Check

**Input:** `research.json` (validated). **Output:** `claims.json` matching `ClaimManifestSchema`.
**Hard stop:** any material claim without supporting evidence. `ace validate` blocks the run.

## Steps

1. List every statement the video will make about the world: what a tool does, its price,
   plan limits, availability, numbers, comparisons, "new"/"first"/"fastest". Each is a claim
   with a short id (`c1`, `c2`, ...). `material: true` if a viewer would act on it or it would
   mislead if wrong; opinions and calls to action are not claims.
2. For each material claim, re-open the source with WebFetch today and copy the exact supporting
   sentence into `evidence[].quote` with its `sourceUrl` (must be one of research.json's sources;
   add the source there first and re-validate research if you need a new one).
3. `status: "supported"` only when the quote states the claim as worded. Pricing and
   availability must be current today. Otherwise `unsupported`.
4. Reword unsupported claims to what the evidence does say, or drop them. Ask the user by click
   when dropping one would change the video's angle.
5. Write `claims.json`, then `pnpm ace validate <run> verify`.

Time-saving claims ("saves 20 minutes") are material: say "can help" unless you measured it.
