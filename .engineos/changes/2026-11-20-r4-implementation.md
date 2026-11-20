---
name: 2026-11-20-r4-implementation
status: active
owner: Ricardo Fagmer
spec: docs/specs/0007-r4-connected-platforms.md
domain: backend
security_review: pending
preview: pending
risk: high
new_feature: true
release: false
---

## What
Implement R4 connected platforms (SPEC 0007 rev 2) through super-dev run `2026-11-20-r4-connected-platforms`. The run covers tickets 01 to 06 on mock clients, then ticket 10 (the final proof).

## Why
PRD 0001 R4 goals 1-3: metrics through the platform APIs, assisted publishing after approval, and OAuth accounts with tokens in the Keychain.

## Scope
Tickets 01 to 06 and 10 of `docs/specs/r4-connected-platforms/tickets/`. Out of this run: 07 to 09, the live clients for YouTube, Instagram and TikTok. Each waits on the owner's developer app and the owner-run checks; AC 63 is owner-run.

## Checklist
- [x] SPEC 0007 frozen: owner answers Q1 to Q5 (rev 1 by another session; rev 2 here applies Q4 (b))
- [x] B10 check passed (dummy Keychain item, 2026-11-20)
- [x] Super-dev prepare (validate mode)
- [ ] Super-dev review: six answers recorded
- [ ] Run: tickets 01 to 06, then 10
- [ ] Final checks, security review, critic
- [ ] CONFIRM or DISCARD

## What was made
<filled on completion>

## Not done
<filled on completion>

## User checklist
- [ ] Create the developer apps (Google, Meta with Instagram Login, TikTok) and store their credentials with `studio secrets set`, then open each platform gate (SPEC 0007 section 16, gate 4)
- [ ] Approve the migration `20261120120000_r4_connected_platforms` before `scripts/install.sh` applies it (gate 2)
- [ ] AC 63, owner-run, per platform when its gate opens

## Verification
[validation] pending — final-stage user approval required

## Human decisions
2026-11-20 | Ricardo Fagmer | high-risk | approved | SPEC 0007 Q1 (a), Q2 (a), Q3 (a), Q5 (a); Q4 (b), Instagram Login, metrics only (OD5 to OD9). Rev 1 recorded Q4 (a) from another session; the owner confirmed (b) here and told that session that R4 runs in this session
2026-11-20 | Ricardo Fagmer | - | approved | Run the B10 check with a dummy Keychain item: passed, item deleted
2026-11-20 | Ricardo Fagmer | - | approved | Super-dev run scope: tickets 01 to 06 plus 10; 07 to 09 wait on the platform apps
2026-11-20 | Ricardo Fagmer | - | approved | R4 ownership: all of R4, R4-01 included, runs in this session. Another session asked to build R4-01; the owner refused here
2026-11-20 | Ricardo Fagmer | high-risk | approved | Super-dev review of run 2026-11-20-r4-connected-platforms. Execution plan approved, all 7 tickets high-risk, protected path packages/core/package.json; preview declined; check plan approved (21 per-ticket, 5 final); security-reviewer, critic and `pnpm audit --prod` approved; git checkpoints state-only; budget defaults. The scope revision is recorded in approval.json

## Changes registered
<filled on completion>

## Notes
Traceability gap reported at prepare: AC 60 (no secret or label in logs, events or errors) maps only to ticket 10 as a test. Every ticket's Definition of Done carries it as a rule.
