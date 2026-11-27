---
name: 2026-11-25-license-guard-warning
status: active
owner: ricardo
spec: n/a — fast fix chosen by the developer; one preflight check changes from blocking to warning, 3 files
domain: backend
security_review: pending
risk: medium
new_feature: false
release: false
---

## What
The watcher preflight no longer stops a run when a third-party asset has no recorded license. It passes with a caveat and the step detail carries the warning "O ativo <ref> é de terceiros e não tem licença registrada; a execução segue mesmo assim."

## Why
Run 01M8ASH5X74D0E1H4Y6EZ0ZM7C ("pokemin") stopped on pokemon-0w816ac@1 with license-doubt. The developer handles licensing outside the tool and asked to remove the guardrail.

## Scope
- apps/watcher/src/engine/steps/preflight.step.ts: license doubt returns `passed-with-caveat` with the warning instead of `failed`.
- apps/watcher/src/engine/owner-texts.ts: `licenseDoubtWarning` replaces `licenseDoubtReason` and `licenseDoubtWhatToDo`.
- apps/watcher/src/engine/postconditions/asset-guards.ts: comment updated.

## Checklist
- [x] Preflight warns instead of failing
- [x] Watcher dist rebuilt (tsc exit 0) and watcher restarted
- [x] Resumed run 01M8ASH5X74D0E1H4Y6EZ0ZM7C passed plan, script and capture; now at step 6 scenes
- [ ] Unit test for the caveat path (final gate)

## What was made
<filled on completion>

## Not done
- The catalog activation rule is kept: a third-party item still needs a license to be activated (packages/core/src/catalog/catalog-policy.ts).
- Web `license-doubt` texts (RunWaitingNotice, RunFixDialog, messages/runs) are left in place for older runs.

## User checklist
- [ ] Keep license records for third-party assets outside the tool
- [ ] Approve final tests and security review

## Verification
[validation] pending — final-stage user approval required. Watcher build (tsc -p tsconfig.build.json) passed on 2026-11-25; live resume passed preflight.

## Human decisions
- 2026-11-25 | ricardo | policy-conflict | approved | "remove this guardrails, should allow this, ill handle license out of ai"

## Changes registered
<filled on completion>
