---
name: 2026-11-22-dev-auto-sign-in
status: active
owner: Claude (supervisor) for the owner
spec: docs/specs/2026-11-22-dev-auto-sign-in-design.md
domain: security
security_review: pending
risk: high
new_feature: true
release: false
---

## What
Under `next dev`, the web signs the owner in automatically through the real api login, using a
passphrase from the untracked `apps/web/.env.local`, so the login page is skipped. It is off under
`next start` and in production builds.

## Why
The owner asked: "for develop env set password to skip login". They chose "Auto sign-in from env
(Recommended)".

## Scope
- `apps/web/src/features/auth/dev-auto-login.ts` (new): switch, passphrase read, server-to-server sign-in.
- `apps/web/src/app/login/dev/route.ts` (new): `GET /login/dev` route handler.
- `apps/web/src/app/login/page.tsx`: dev redirect and failure notice.
- `apps/web/.env.example`: the two development variables, empty.
- `docs/specs/2026-11-22-dev-auto-sign-in-design.md` (new): design note.

## Checklist
- [x] Design note with rejected alternatives and rollback
- [x] Dev-only route that signs in through the real login; passphrase from env only, no fallback
- [x] Login page redirect with loop guard and failure notice
- [ ] Browser check: dev with the switch skips login; without it, the form shows
- [ ] Production guard: `/login/dev` answers 404 under `next start`
- [ ] Final typecheck and lint (final-checkpoint consent)
- [ ] Critic pass and security review (final gate)

## What was made
<filled on completion>

## Not done
<filled on completion>

## User checklist
- [ ] Add `ENGINEOS_VIDEO_CREATOR_DEV_AUTO_LOGIN=1` and `ENGINEOS_VIDEO_CREATOR_DEV_PASSPHRASE=<your passphrase>` to `apps/web/.env.local`
- [ ] Run the web with `pnpm --filter @studio/web dev` (port 4310, the origin the api allows)

## Verification
[validation] pending — final-stage user approval required

## Human decisions
- 2026-11-22 | owner | high-risk | approved | Chose "Auto sign-in from env (Recommended)" for "for develop env set password to skip login", for both apps.

## Changes registered
<filled on completion>

## Notes
eng-grafo gets the same feature in its own session. i18n runs in separate sessions, which edit the login files only after this change lands.
