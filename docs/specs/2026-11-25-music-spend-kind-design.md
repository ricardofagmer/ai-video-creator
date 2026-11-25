# Music spend kind: price, record and show ElevenLabs music generation — design

Date: 2026-11-25 · Owner: Ricardo Fagmer · Status: accepted (owner approved 2026-11-25: "Approve (Recommended)", "No preview, build (Recommended)")

Follow-up of `docs/specs/2026-11-25-ai-music-choice-design.md` (section 4, acceptance 5).

## Problem

In `auto` music mode with no matching catalog track, the `music` stage should generate a track
with ElevenLabs Music. That path exists (`apps/watcher/src/stages/music/`) but
`priceMusicGeneration()` always answers `unpriced`, so the stage stops for a person before any
call. The cost ledger cannot price or record music: `UsageQuantity`, `CostSessionSchema`, the
price table and the `cost_entries` CHECK know only `model`, `tts` and `render`.

## Owner decisions (clickable questions, 2026-11-25)

- Rate: "USD 0.15/min (Recommended)". Published ElevenLabs API rate.
- Limit reached: "Warn and generate". Same as every other stage since the 2026-11-25
  "runs warn, never stop" decision. This replaces "spend limit reached: the stage stops for a
  person" in section 4 of the parent spec.
- Totals split: "New `music` line (Recommended)".

## Provider facts (read 2026-11-25)

- https://elevenlabs.io/pricing/api: Music Generation USD 0.15 per minute, "5 minute duration
  limit"; billed per generated minute.
- https://elevenlabs.io/docs/api-reference/music/compose: `POST /v1/music`, `music_length_ms`
  3000 to 600000, `model_id` one of `music_v1` (default), `music_v2`, `music_v2_5`,
  `force_instrumental`, query `output_format`. The client already sends `music_v2_5`,
  `mp3_44100_128` and caps the length at 300000 ms (the stricter of the two pages). No change.
- Whether the API needs a paid plan is not stated on either page. A plan without access answers
  with an HTTP error, which the stage already turns into a stop for a person.

## Chosen approach

### 1. Cost format (`packages/shared`, contract)

- `UsageQuantity` gains `{ kind: 'music'; provider: 'elevenlabs'; musicSeconds: number }`.
- `CostSessionSchema` gains a strict member:
  `{ kind: 'music', sessionId, stepKey, provider: 'elevenlabs', musicSeconds (>= 0), usd, at }`.
  `cost.json` stays `format: 1`: a new union member is additive for files written before.
- `TotalsSchema.costByProvider` gains `music` with default 0, so `run.json` files written before
  still parse; `emptyTotals` carries `music: 0`.
- Unit is seconds (a float, the requested `music_length_ms / 1000`), like `renderSeconds`.
  The quantity billed is the requested length, known before the call; the provider returns no
  usage figure.

### 2. Price table (`packages/core/src/costs`)

- `PriceTable.musicPerSecond: Record<'elevenlabs', UnitPrice>`, entry
  `{ status: 'priced', usdPerUnit: 0.0025, basis: 'published-rate', source: ... }`
  (USD 0.15 / 60). Version bumps to `2026-11-25.1`; the pricing page joins `sources`.
- `priceUsage` prices `music` through `unitUsd`, so an `unpriced` entry still throws
  `PriceNotAvailableError`. `CostLedgerService.priceUsd` maps `music` to provider `elevenlabs`
  (mock mode prices at zero, as for voice).

### 3. Persistence and aggregation (`packages/core`, `apps/api`)

- `cost_entries`: `kind` CHECK accepts `music`; new nullable column `music_seconds REAL`.
  SQLite cannot alter a CHECK, so migration `20261125120000_music_cost_kind` redefines the table
  the same way `20261123180000_asset_job_cost_source` did (copy every row with its id, recreate
  both indexes). `schema.prisma` gains `musicSeconds`. The migration is authored only; it runs
  through `prisma migrate deploy` at install or first-run setup after the owner's own
  confirmation. Down path: the same redefinition with the old list once no `music` row exists,
  or restoring the copy of `db/studio.sqlite` taken before.
- Mappers: `usageOfCostSession` and `toCostEntryData` handle `music`; `assetJobCostUsageOf`
  answers null for it (no asset job bills music).
- Month-to-date already adds sessions of `cost.json` not yet indexed, so the month figure is
  right before and after the migration. Until the migration is applied, indexing a run that
  holds a music session is refused by the CHECK; the implementation confirms the indexer reports
  that without losing the other runs, and the record says what it found.
- The watcher still writes only `cost.json` (ADR 0003).

### 4. Watcher (`apps/watcher`)

- `priceMusicGeneration(ledger, lengthMs)` prices `{ kind: 'music', provider: 'elevenlabs',
  musicSeconds }` with `ledger.priceUsd`; `PriceNotAvailableError` answers `unpriced` (stage
  stops for a person, as today). A priced answer carries `record`, which writes one `music`
  session through `ledger.record` after the audio file is written.
- `music.executor.ts` `estimate()` in `auto` mode with live ElevenLabs and no catalog candidate
  reports that price, for the video's target duration clamped to the provider limits.
- Limits: no new check. The preflight cost ceilings read the estimate and warn with both amounts
  when a limit is passed; the track is still generated (owner decision above).
- `costTotals` puts `music` sessions in the new `music` family.
- Stops for a person, unchanged: ElevenLabs not connected or no key, provider refusal or a
  non-MP3 answer, price missing from the table.

### 5. Web (`apps/web`)

`ReviewCostCard` shows a music session as one row: actor "Música · ElevenLabs" (pt-BR),
"Música · ElevenLabs" (es), "Music · ElevenLabs" (en), quantity in seconds with the existing
`seconds` text, USD as the other rows. No new control.

### 6. Documents

`docs/RUN-FORMAT.md`: `costByProvider { claude, tts, render, music }` and the `music` session.

## Rejected alternatives

- Record music as a `tts` session with a made-up character count: the ledger re-prices every
  session from its quantities, so the count would be a fiction and the cost screen would show
  characters for a song.
- A generic `kind: 'other'` carrying only USD: the ledger could not re-check the price against
  the table, which is the guard that keeps `cost.json` honest.
- Bill the measured length of the returned file: needs a probe before recording and still may
  differ from the provider's bill; the requested length is what the request asks to be charged.

## Out of scope

Music in asset jobs or curations, saving generated tracks to the catalog, composition plans,
fine-tunes, changes to the music client or prompt, running the migration, the CLI.

## Risk

High (DB schema surface, paid external call with a provider credential). Human approval before
any external effect; a security review and an independent `critic` pass at the final gate.
Rollback: revert the working-tree change; the migration's down path above.

## Acceptance

1. `auto` mode, no matching catalog track, ElevenLabs live and priced: a track is generated and
   mixed, `cost.json` holds one `music` session whose USD is `musicSeconds x 0.0025`, the run
   total includes it and `totals.costByProvider.music` equals it.
2. The review screen's cost card shows that session as a music row in pt-BR, es and en.
3. The stage's estimate in that case equals the price for the video's target duration; with a
   limit passed, preflight warns with both amounts and the run continues.
4. No key, ElevenLabs off, provider refusal, or `musicPerSecond.elevenlabs` set to `unpriced`:
   the stage stops for a person and nothing is billed or recorded.
5. Mock mode: no `music` session with a non-zero USD is ever written.
6. `run.json` and `cost.json` files written before this change still parse.
7. After the migration, `cost_entries` accepts a `music` row with `music_seconds`; rows that
   existed keep their ids and values.

## Tickets (dependency order)

- T1 shared: `UsageQuantity`, `CostSessionSchema`, `TotalsSchema`. Freezes the contract.
- T2 core + api (after T1): price table, pricing, ledger, mappers, schema, migration (authored).
- T3 watcher (after T1, T2): pricing seam, estimate, totals family.
- T4 web (after T1): cost card row and texts.
- T5 docs (after T1): `docs/RUN-FORMAT.md`.
- Final proof (final gate, owner-approved): typecheck, lint, tests for acceptance 1 to 7.
