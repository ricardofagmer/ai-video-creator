# 11-template-folder-lint: Template folder lint: the bypasses of finding L2 (R4H-11)

**What to build:** `templateFolderIssues` reports the remote references the 2026-11-21 review got past it: entity-encoded schemes, attributes after `/` or a quote, tab and line breaks inside a URL, `background` and the other URL-bearing attributes, `<meta http-equiv="refresh">` and CSS `image-set()`.

**Blocked by:** none (the owner froze SPEC 0008 rev 2 on 2026-11-21). Independent of 08, 09 and 10.

**Status:** integrated (2026-11-21, supervisor in-session)

## Requirements
- AC 94
- AC 95 (SPEC 0008 section 17.13; finding L2 of section 17.1)

## Technical details
docs/specs/0008-r4-hyperframes-templates.md section 17.7 (rules 1 to 7 and the known limits) and K18, K19. One file: `packages/shared/src/hyperframes/template-folder.ts`. The function keeps its signature and stays pure. No new issue code: `template-issues.ts` is outside this ticket, so a value that still holds an undecoded named character reference is reported as `folder-reference-scheme`. Value handling order (frozen): decode character references, remove tab, CR and LF, trim characters at or below U+0020, then the rev 1 checks.

Read without editing `seeds/templates/hyperframes/title-card/**` and confirm by reading that the seed template still yields no issue under the new rules; report any line that would now be refused instead of loosening a rule.

This remains a lint. Do not add a parser dependency, and do not present the check as the boundary: `--strict` and the sandbox are.

## Acceptance criteria
- [ ] Each input listed in AC 94 yields an issue.
- [ ] Each input listed in AC 95 yields none, and every rev 1 AC 77 case still behaves as before.
- [ ] `TemplateIssueCode`, the function signature and the callers (`packages/core/src/catalog/hyperframes-template.check.ts`, the watcher's staged copy) need no change.
- [ ] The file states the known limits of section 17.7 in one comment.

## Testing requirements
None in this ticket, and none in this wave (SPEC 0008 K17, owner decision OD8). Do not add or edit `template-folder.test.ts`; if an existing expectation breaks, ticket 12 updates it and lists it.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no new dependency, no regular expression with nested unbounded repetition over template text (state how each pattern is bounded).
- [ ] No edit outside the one exclusive file.
- [ ] No check, build, test or git write was run by this ticket.

## EngineOS brief metadata
- Exclusive paths: `packages/shared/src/hyperframes/template-folder.ts`
- dependsOn: none
- Owner: backend-coordinator
- Risk / autonomy: low / A2 inside the exclusive path; no external effect
- Contracts: `docs/specs/0008-r4-hyperframes-templates.md` sections 4.3 and 17.7 (rev 2, once frozen)
