---
name: 2026-11-25-elevenlabs-quota-message
status: active
owner: ricardo
spec: n/a — fast fix of an error message; the failure class and recovery path are unchanged
domain: backend
security_review: pending
risk: medium
new_feature: false
release: false
---

## What
An ElevenLabs 401/403 whose refusal code is `quota_exceeded` now reads as "no quota left on this account" instead of "rejected the credential", in the step event and in the owner's waiting reason.

## Why
Run 01M8A4T6AK2Z916WBX044GSMJM stopped at step 7 (narration) with "rejected the credential" while the key was valid: the free plan's character quota was spent. The developer asked to fix the message before deciding how narration continues.

## Scope
- packages/core/src/providers/provider-failure.ts: `refusalCode` on `ProviderErrorSignal`; `refusal: 'credential' | 'quota-exceeded'` on the authentication failure.
- packages/core/src/providers/provider-failure.mapper.ts: quota message.
- packages/core/src/agents/adapters/claude-code-envelope.ts: `refusal: 'credential'`.
- packages/shared/src/ports/stage-executor.ts: optional `refusal` on the authentication `StageFailure`.
- apps/watcher/src/stages/shared/elevenlabs-refusal-code.ts (new): reads at most 4 KB of a 401/403 body, returns only a `[a-z_]{1,40}` code.
- apps/watcher/src/stages/voice/elevenlabs-tts.client.ts, apps/watcher/src/stages/music/elevenlabs-music.client.ts: pass the refusal code.
- apps/watcher/src/engine/failure/recovery.policy.ts, apps/watcher/src/engine/owner-texts.ts: pt-BR quota reason and what-to-do.

## Checklist
- [x] Classify quota_exceeded separately from a refused key
- [x] Quota message in events and owner texts
- [x] Build shared, core, watcher; restart watcher; resume shows "Provider elevenlabs has no quota left on this account"
- [ ] Unit test for `elevenLabsRefusalCode` and the classifier (final gate)

## What was made
<filled on completion>

## Not done
- voice-sample.speakers.ts still maps every authentication failure to 'credential-refused'.

## User checklist
- [ ] Decide how narration continues (wait for quota reset 2026-12-17, upgrade, or switch the voice mode)
- [ ] Approve final tests and security review of the new body read

## Verification
[validation] pending — final-stage user approval required. Build (tsc) of shared, core and watcher passed on 2026-11-25; live resume event confirmed the new message.

## Human decisions
- 2026-11-25 | ricardo | approach | approved | "Fix message, then decide"

## Changes registered
<filled on completion>

## Notes
Security: the error body is read only on 401/403, capped at 4 KB, parsed as JSON, and only `detail.status` matching `^[a-z_]{1,40}$` leaves the helper. The body is never logged, stored or returned.
