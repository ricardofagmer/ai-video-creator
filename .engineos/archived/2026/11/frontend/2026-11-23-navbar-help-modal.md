---
name: 2026-11-23-navbar-help-modal
status: done
completed: 2026-11-23
owner: Ricardo Fagmer
spec: n/a — the developer chose "Fast change (supervisor)" on 2026-11-23 (simple-task planning choice); small, low-risk, reversible UI addition
domain: frontend
security_review: not-required
risk: low
new_feature: true
release: false
---

## What
A "How to use" help button in the studio navbar that opens a modal showing the Video Studio usage flow diagram plus three tip cards, in the UI language and theme.

## Why
The owner asked for in-app guidance on how to use the system: the Archify usage flow made earlier in this session, reachable from the navbar.

## Scope
- `apps/web/src/features/shell/HelpButton.tsx` and `HelpButton.module.css` (new)
- `apps/web/src/app/(studio)/layout.tsx` (button wired into the AppShell `status` slot)
- `apps/web/src/messages/pt-BR.ts`, `en.ts`, `es.ts` (`shell.help` block)
- `packages/ui/src/components/icon/Icon.tsx` (`help-circle` glyph)
- `apps/web/public/ajuda/como-usar-{pt-BR,en,es}-{light,dark}.svg` (static diagram exports)
- `.archify/workflow-video-studio-usage-ptbr-20261123/` and `.archify/workflow-video-studio-usage-es-20261123/` in the parent folder (translated diagram sources, outside this repo)

## Checklist
- [x] Translate the Archify usage diagram to pt-BR and es and finalize both
- [x] Export light and dark SVGs for the three locales into `public/ajuda/`
- [x] Add `shell.help` messages in pt-BR, en and es
- [x] Add the `help-circle` icon to `@studio/ui`
- [x] Build `HelpButton` with the `@studio/ui` Dialog (wide) and wire it into the navbar
- [x] Verify visibly in the running app (dark, light, pt-BR, Escape/close, mobile width)

## What was made
- Added `HelpButton`, a ghost small button with the new `help-circle` icon whose label shows from 768px up (icon-only below). It opens the existing `@studio/ui` `Dialog` in `wide` size with a close button and a "Got it" footer.
- The modal shows the usage diagram as a same-origin static SVG (no CSP change). Light and dark versions swap through CSS on `data-theme` or the OS preference, and the image follows the UI locale (pt-BR, en, es).
- Below the diagram, three tip cards: everyday commands, where your video lands, gates and safety.
- The diagram and tips mount only while the modal is open, so the roughly 160 KB SVGs are not fetched on every page.
- Added the `shell.help` messages in all three catalogues. Tips are keyed objects because the catalogue `Messages<T>` type does not support arrays.
- Fixed during verification: the figure collapsed into a tiny scroller inside the Dialog's flex body; `flex-shrink: 0` fixed it.

## Not done
- The Archify legend inside the pt-BR and es diagrams ("Legend", "User UI", ...) stays in English; only node and lane text was translated.
- The final checks (ui typecheck and lint, web `next build`) were offered and skipped by the developer.

## User checklist
- [ ] Run the skipped final checks when convenient: `pnpm --filter @studio/ui typecheck`, `pnpm --filter @studio/ui lint`, `pnpm --filter web build`
- [ ] Optional: ask to translate the diagram legend in the pt-BR and es SVGs
- [ ] Commit the change (nothing committed; git writes need your approval)

## Verification
- ran: `cd apps/web && npx tsc --noEmit -p .` exit 0 (2026-11-23)
- ran: `cd apps/web && npx eslint src/features/shell/HelpButton.tsx "src/app/(studio)/layout.tsx" src/messages` exit 0 (2026-11-23)
- Manual, in the built-in browser on the `studio-web-dev` preview (port 4320): the button showed in the navbar. The modal showed the full dark diagram and the three tips. With `data-theme="light"` it swapped to the light SVG. After switching the language to Português it showed the pt-BR title, tips and diagram. Escape closed it and returned focus to the button. At 375px wide the button was icon-only, not covered (hit-test on the button itself), and the page had no horizontal overflow; the diagram scrolls inside its own frame.
- Final checkpoint (kernel `checks: ask`): the developer answered "Skip for now" on 2026-11-23, so ui typecheck and lint and the web build were not run (listed in User checklist).

## Human decisions
- 2026-11-23 | Ricardo Fagmer | planning choice (not a hitl reason) | approved | "Fast change (supervisor)"
- 2026-11-23 | Ricardo Fagmer | display choice | approved | "Static SVG image"
- 2026-11-23 | Ricardo Fagmer | language choice | approved | "Follow language switch"
- 2026-11-23 | Ricardo Fagmer | final checks | refused | "Skip for now"
- No hitl.required reason fired (risk low, autonomy A2).

## Changes registered
Scoped to this change. The working tree carries other sessions' uncommitted work: `layout.tsx` already had unrelated diffs, and the message catalogues and `Icon.tsx` were already untracked before this change.

```
$ git status --short --untracked-files=all -- <files of this change>
 M apps/web/src/app/(studio)/layout.tsx
?? apps/web/public/ajuda/como-usar-en-dark.svg
?? apps/web/public/ajuda/como-usar-en-light.svg
?? apps/web/public/ajuda/como-usar-es-dark.svg
?? apps/web/public/ajuda/como-usar-es-light.svg
?? apps/web/public/ajuda/como-usar-pt-BR-dark.svg
?? apps/web/public/ajuda/como-usar-pt-BR-light.svg
?? apps/web/src/features/shell/HelpButton.module.css
?? apps/web/src/features/shell/HelpButton.tsx
?? apps/web/src/messages/en.ts
?? apps/web/src/messages/es.ts
?? apps/web/src/messages/pt-BR.ts
?? packages/ui/src/components/icon/Icon.tsx

$ git diff --stat HEAD -- <files of this change>
 apps/web/src/app/(studio)/layout.tsx | 34 ++++++++++++++++++++++++----------
 1 file changed, 24 insertions(+), 10 deletions(-)
```

- Modified: `apps/web/src/app/(studio)/layout.tsx`, `apps/web/src/messages/{pt-BR,en,es}.ts`, `packages/ui/src/components/icon/Icon.tsx`
- Added: `apps/web/src/features/shell/HelpButton.tsx`, `HelpButton.module.css`, six SVGs in `apps/web/public/ajuda/`
- Movements/renames: none. Commits: none.

## Notes
- The diagram sources are Archify candidates in `../.archify/` (en `workflow-video-studio-usage-20261123-145425`, plus the ptbr and es folders). Re-export the SVGs from there if the flow changes.
- The `Messages<T>` catalogue type maps only strings, functions and objects; arrays in `as const` catalogues fail on readonly tuples.
