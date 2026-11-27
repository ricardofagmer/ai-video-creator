---
name: 2026-11-25-elevenlabs-voice-registration
status: done
completed: 2026-11-25
owner: Ricardo Fagmer
spec: n/a — developer chose "Fast change (supervisor)" on 2026-11-25
domain: backend
security_review: not-required
risk: medium
new_feature: true
release: false
---

## What
ElevenLabs voices and speech models can be registered per catalog voice, and the default voice id
and model id can be set in `<data home>/providers.json`.

## Why
The `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL_ID` lines lived only in
`ai-creator-engine/.env`, which `video-studio` never reads. `providers.json` had no ElevenLabs
fields and left the provider in mock mode, and the launchd watcher starts with no shell variables.
The watcher also refused every ElevenLabs voice other than the single `ELEVENLABS_VOICE_ID` one.

## Scope
- `packages/shared/src/catalog/kind-details.ts`
- `packages/core/src/providers/provider-settings-file.ts`
- `apps/watcher/src/stages/voice/elevenlabs-voice-selection.ts` (new)
- `apps/watcher/src/stages/voice/narration-voice.ts`
- `apps/watcher/src/asset-jobs/voice-sample.plan.ts`
- `apps/watcher/src/stages/shared/stage-texts.ts`
- `apps/web/src/features/catalog/asset-form/kind-detail-fields.ts`
- `apps/web/src/features/catalog/asset-form/kind-details-model.ts`
- `apps/web/src/features/catalog/components/AssetVersionDetails.tsx`
- `apps/web/src/messages/catalog/{en,pt-BR,es}.ts`
- `.claude/launch.json` of the parent folder: new `studio-api-dev` entry (API for the 4320 dev server)

## Checklist
- [x] Find why the ElevenLabs variables do not load
- [x] Accept `elevenLabsVoiceId` and `elevenLabsModelId` in `providers.json`
- [x] Let a catalog voice carry its own voice id and speech model
- [x] Add the speech model field to the catalog form and the detail view
- [x] Build shared, core, api and watcher; typecheck web (approved 2026-11-25, both exit 0)
- [x] ~~Run the `@studio/core` tests~~ — not run; developer answered "Skip tests" on 2026-11-25
- [x] Verify a save and a live voice sample end to end

## What was made
- `AiModelDetailsSchema` gained the optional `voiceModelId`.
- `providers.json` schema gained `elevenLabsVoiceId` and `elevenLabsModelId`, mapped to
  `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL_ID`; an explicit variable still wins.
- `selectElevenLabsVoice` resolves the voice id (the item's public id, or the configured default)
  and the speech model (the item's, or the configured default). `planVoice` and `planVoiceSample`
  both use it.
- The catalog form shows "Speech model id" for the AI model kind; the detail view shows it when set.

## Not done
- No test ran; the developer skipped them.
- The installed app under `/Applications` was not redeployed. Its launchd watcher is unloaded for
  this login and loads again at next login on the old build, which rejects the new
  `providers.json` keys.

## User checklist
- [x] Approve the build and typecheck
- [x] Store the key with `studio secrets set elevenlabs-api-key`
- [x] Approve live mode and the IDs in `providers.json`
- [x] Approve one paid voice sample
- [x] Redeploy the installed app (or remove `elevenLabsVoiceId` and `elevenLabsModelId` from `providers.json`) before the launchd watcher loads again at next login. Done 2026-11-25: payload `builtAt` 2026-11-25T10:57:25.407Z swapped into `/Applications`, launchd watcher pid 28104 logged `providers.mode` elevenlabs `live`, `credentialSource: keychain`, `watcher.started`. Previous app kept at `/Applications/EngineOS Video Creator.prev-20261125.app`.
- [ ] Open the installed app so its API (4311) and web (4310) start, then sign in with the passphrase
- [ ] Run the `@studio/core` tests when wanted
- [ ] Delete the draft asset `elevenlabs-test-voice` and `out/elevenlabs-test-voice.json` if not wanted

## Verification
- ran: `pnpm turbo run build --filter=@studio/shared --filter=@studio/core --filter=@studio/api --filter=@studio/watcher` exit 0 (2026-11-25)
- ran: `pnpm --filter @studio/web typecheck` exit 0 (2026-11-25)
- Tests: not run; the developer answered "Skip tests".
- Manual, 2026-11-25: registered `elevenlabs-test-voice@1` in the dev app (provider ElevenLabs, Public id, speech model
  `eleven_multilingual_v2`); "Listen" produced a real sample. Watcher log: `asset-job.sample-spoken`, `engine: elevenlabs`,
  `format: mp3`, `bytes: 72350`, `characters: 75`, `usd: 0.01365`; `asset-job.ended`, `status: done`.
- Manual, 2026-11-25: the "Speech model id" field renders at `http://127.0.0.1:4320/catalogo/novo`
  with kind "AI model".

## Human decisions
- 2026-11-25 | Ricardo Fagmer | no hitl reason fired | approved | settings home: providers.json; registration: per catalog voice; API key: Keychain command; planning: Fast change (supervisor)
- 2026-11-25 | Ricardo Fagmer | no hitl reason fired | refused | build and typecheck: "Skip for now"; tests: "Skip tests"
- 2026-11-25 | Ricardo Fagmer | no hitl reason fired | approved | restart: "Restart both". Only the API was restarted; the watcher restart was not done because no build ran.

## Changes registered
- The working tree already held 210 modified files from earlier work; no commit was made.
- This change touched 11 modified files and 1 new file (`git status --short`, filtered to them):

```
 M apps/watcher/src/asset-jobs/voice-sample.plan.ts
 M apps/watcher/src/stages/shared/stage-texts.ts
 M apps/watcher/src/stages/voice/narration-voice.ts
?? apps/watcher/src/stages/voice/elevenlabs-voice-selection.ts
 M apps/web/src/features/catalog/asset-form/kind-detail-fields.ts
 M apps/web/src/features/catalog/asset-form/kind-details-model.ts
 M apps/web/src/features/catalog/components/AssetVersionDetails.tsx
 M apps/web/src/messages/catalog/en.ts
 M apps/web/src/messages/catalog/es.ts
 M apps/web/src/messages/catalog/pt-BR.ts
 M packages/core/src/providers/provider-settings-file.ts
 M packages/shared/src/catalog/kind-details.ts
```

## Notes
- 2026-11-25: after the developer stored the key, `"elevenlabs": "live"` was set again and the
  repo watcher booted with `provider: elevenlabs, mode: live, credentialSource: keychain`.
- 2026-11-25: `elevenLabsVoiceId` and `elevenLabsModelId` were written to `providers.json`
  (backup `providers.json.bak-20261125-074645`). With `"elevenlabs": "live"` and no key in the
  Keychain the watcher refuses to boot (`watcher.boot-failed`, `ProviderCredentialMissingError`),
  so the mode line was taken out again; ElevenLabs stays mock until the key is stored.
- 2026-11-25: developer chose "Run repo watcher". `com.videostudio.watcher` was unloaded with
  `launchctl bootout` (the plist stays, so it loads again at next login) and the repo watcher runs
  from `apps/watcher/dist/main.js` with web port 4320. The installed build rejects the new
  `providers.json` keys, so they must be removed, or the app redeployed, before it runs again.
- The installed app's API (pid 3411, port 4311) was stopped so the repo API could serve the 4320
  dev server; the installed app needs its API started again to be used.
