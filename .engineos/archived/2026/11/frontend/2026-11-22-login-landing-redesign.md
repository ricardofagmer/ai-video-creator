---
name: 2026-11-22-login-landing-redesign
status: done
completed: 2026-11-22
owner: Ricardo Fagmer
spec: docs/specs/2026-11-22-fagmer-design-system-design.md
domain: frontend
security_review: done
risk: low
new_feature: false
release: false
---

## What
Redesigned `/login` in the fagmertech landing-page layout: floating glass top bar, aurora halos and a
split hero with the sign-in card on the right (one column on phones).

## Why
The owner asked for a "really professional" login that follows the fagmertech landing page pattern.

## Scope
- `apps/web/src/app/login/page.tsx` (layout of the page; session check and redirect unchanged)
- `apps/web/src/features/auth/LoginForm.tsx` (card heading markup and CSS module only)
- `apps/web/src/features/auth/login.module.css` (new)
- `apps/web/src/features/common/layout.module.css` (removed the old auth classes)
- `docs/specs/2026-11-22-fagmer-design-system-design.md` (new "Login" section)
- `../.claude/launch.json` (new `studio-web-dev` entry, port 4320, for browser checks; outside this repo)

## Checklist
- [x] Add the Login section to the design-system spec (chosen approach and a rejected alternative)
- [x] Build the split hero and card layout with tokens only
- [x] Browser check at 1280 px dark and light, and at 375 px (order intro, card, facts; no horizontal scroll)
- [x] Typecheck and lint `@studio/web`
- [x] Security review of the login diff (read-only security-reviewer: CLEAR, no findings)

## What was made
- `/login` now has a glass top bar with the logo and theme toggle, two slow aurora halos (stopped
  under reduced motion), a status chip whose light is green when the local API answers and amber when
  it does not, a headline with gradient words, a lead line, a `<dl>` with three true facts, and the
  sign-in card with a gradient edge, a halo, an eyebrow above the single h1 and a footnote on where
  the password goes.
- The form's behaviour, copy and accessibility wiring did not change.
- After the review, the footnote was made exact: "nunca fica na URL, no armazenamento do navegador nem
  nos logs" (the browser's own password manager may still offer to save it; the API logs only
  method, route and status, through redaction).

## Not done
- nothing

## User checklist
- [ ] Look at the new login in the browser and confirm the look.
- [ ] Decide on committing the change (no git writes were made).
- [ ] Rebuild and restart the web app on port 4310 (`next build`, then `next start`) so the real app
  serves the new login; port 4310 still serves an older build.
- [ ] Sign in once on port 4310. On the 4320 test server the API refuses browser logins by design
  (origin check allows only the web origin, `127.0.0.1:4310`).

## Verification
- ran: `pnpm --filter @studio/web typecheck` exit 0 (2026-11-22)
- ran: `pnpm --filter @studio/web lint` exit 0 (2026-11-22)
- Browser (http://127.0.0.1:4320/login, dev server): 1280x800 dark and light, 375x812 phone; one h1,
  scrollWidth equal to the viewport, no console errors.
- Security review (read-only `security-reviewer`, 2026-11-22): CLEAR, no findings.
- The footnote wording edit (one JSX string) came after typecheck and lint; it was checked in the
  browser only.

## Human decisions
- 2026-11-22 | Ricardo Fagmer | none (no hitl reason fired) | approved | Plan: "Fast change (supervisor)"; layout: "Split hero + card".
- 2026-11-22 | Ricardo Fagmer | none | approved | Final checks: "Run both" (typecheck and lint).
- 2026-11-22 | Ricardo Fagmer | none | approved | Security review: "Run security reviewer" (read-only, no scans).

## Changes registered
```
 M apps/web/src/app/login/page.tsx
 M apps/web/src/features/auth/LoginForm.tsx
 M apps/web/src/features/common/layout.module.css
 M docs/specs/2026-11-22-fagmer-design-system-design.md
?? .engineos/changes/2026-11-22-login-landing-redesign.md
?? apps/web/src/features/auth/login.module.css   (361 lines, new)

 apps/web/src/app/login/page.tsx                    | 67 ++++++++++++++++++----
 apps/web/src/features/auth/LoginForm.tsx           |  8 ++-
 apps/web/src/features/common/layout.module.css     | 41 ++++---------
 .../2026-11-22-fagmer-design-system-design.md      | 19 ++++++
 4 files changed, 91 insertions(+), 44 deletions(-)
```
- Modified: `apps/web/src/app/login/page.tsx`, `apps/web/src/features/auth/LoginForm.tsx`,
  `apps/web/src/features/common/layout.module.css`, `docs/specs/2026-11-22-fagmer-design-system-design.md`.
- Added: `apps/web/src/features/auth/login.module.css`, this record.
- `layout.module.css` also carries the `.checkGrid` block added by the concurrent RecipeFlowSections
  change; that block is not part of this record.
- No renames or moves. No commits.

## Notes
- localhost:3000 is the separate eng-grafo repo; its login is handled in its own session.
- Port 4310 serves a stale build; use the `studio-web-dev` launch entry on 127.0.0.1:4320 (the
  middleware host allowlist refuses `localhost:4320`).
