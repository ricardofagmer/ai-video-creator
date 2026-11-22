---
name: 2026-11-21-elevenlabs-price
status: active
owner: Ricardo Fagmer
spec: none (one config value, owner-supplied)
domain: backend
security_review: not-required
risk: medium
new_feature: false
release: false
---

## What
Price table `2026-11-21.1`: ElevenLabs TTS moves from `unpriced` to `priced` at USD 0.000182 per
character (`basis: published-rate`).

## Why
Open R1 user checklist item (`.engineos/changes/2026-11-18-r1-implementation.md`, "Set the
ElevenLabs per-character price"): with the provider unpriced, live cloned-voice narration fails
closed (`PriceNotAvailableError`) and the Planner packet leaves ElevenLabs out of its TTS prices.

## Source
- Owner plan: Creator (owner answer 2026-11-21).
- https://elevenlabs.io/pricing, read 2026-11-21: Creator USD 22/month, 121,000 credits; V2
  Multilingual models spend 1 credit per character. No per-1,000-character overage rate is published
  for Multilingual v2 (the "extra minute" rate is per audio minute and does not apply).
- Rate: plan average 22 / 121,000 = 0.0001818..., rounded up to 0.000182 (USD 0.18 per 1,000).
  Excludes the first-month discount and taxes. Re-read on a plan or model change
  (`ELEVENLABS_MODEL_ID` default `eleven_multilingual_v2`; Flash/Turbo spend 0.5 to 1 credit).

## Scope
`packages/core/src/costs/price-table.ts` only. No contract, schema or test change; nothing else
reads the version string.

## Checklist
- [x] Rate and version set (2026-11-21)
- [x] R1 change record: user checklist item ticked, Human decisions row (2026-11-21)
- [ ] Final checks at the end of the product work (owner decision 2026-11-21: tests and checks wait)

## What was made
- `packages/core/src/costs/price-table.ts`: `version` `2026-11-21.1`, `readAt` `2026-11-21`, the
  ElevenLabs pricing source added to `sources`, `ttsPerCharacter.elevenlabs` priced at 0.000182 with
  its source and a comment on how the rate is derived.
- Not compiled. No live ElevenLabs call made.

## Verification
[validation] pending — final-stage user approval required

## Human decisions
2026-11-21 | Ricardo Fagmer | ElevenLabs rate source | approved | "Look up my plan's rate"; plan "Creator"
2026-11-21 | Ricardo Fagmer | ElevenLabs rate | approved | "Set $0.18 per 1k (Recommended)"
