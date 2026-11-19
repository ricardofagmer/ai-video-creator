---
name: <YYYY-MM-DD>-<short-kebab-slug>
status: active
owner: <name>
spec: docs/specs/<YYYY-MM-DD>-<slug>-design.md   # below non-negotiable #1's threshold, use: n/a — <reason>
domain: <backend|frontend|mobile|dba|llm|devops|security|test|docs|general>
# security_review: pending | done | not-required
# preview: pending | declined | selected
# risk: low | medium | high   # classified tier; read by the proportional checkpoint (default low)
# new_feature: true | false
# release: true | false   # true only when this change ships (PR, version bump, spec archive); read by the release-gated checkpoint (default false)
# ticket: <tracker id (PROJ-123, #42) or URL of the ticket this change implements>   # optional
# prd_decision: create | skip   # closing pipeline on only: the developer's answer to Create PRD / Skip PRD
# prd_decision_date: <YYYY-MM-DD>
# prd_decision_scope: <scope revision token>
---

## What
<the change in one or two sentences>

## Why
<motivation / problem being solved>

## Scope
<files, modules, or surfaces touched>

## Checklist
- [ ] <planned step>
- [ ] <planned step>

## What was made
<filled on completion: past-tense, concrete account of what actually landed>
<!-- Closing pipeline on only: end this section with a `### Outcome report` subsection holding, in order, `#### Delivered`, `#### Artifacts`, `#### Served surface`, `#### Cross-check`, `#### Security` and `#### Not done, not verified, skipped` (docs/specs/2026-11-16-uniform-closing-pipeline.md 2e). It is a subsection, never a new `## ` section. -->

## Not done
<what was planned but not delivered, and why; "nothing" when complete>

## User checklist
<!-- What the user must still do or confirm for this work to be finished in the world: deploys, approvals, credentials/env setup, manual checks, deferred final-gate runs. Add items while the work proceeds. At archive time tick each finished item with [x] and leave unfinished ones as [ ]; they stay visible in the archive as the open-items list. Write `none — <reason>` when nothing is left for the user. -->
- [ ] <user action>

## Verification
<!-- One line per executed check, in this exact form: - ran: `<command>` exit <code> (<YYYY-MM-DD>)
     status: done needs at least one such line here; remove the final checkpoint's pending marker line (it starts with [validation]) from this section once the checks ran.
     Small-change exemption: when `scripts/kernel.sh checkpoint` answered checks: skip, write instead: - [validation] not required — <reason>
     record-verify accepts it only when the kernel, over this record's registered files and risk/new_feature front matter, still answers skip. -->
<how it was checked: typecheck, lint, tests, manual>

## Human decisions
<!-- date | who | reasons (from registries/policy.json hitl.reasons) | approved/refused | note -->
<none if no hitl.required fired; a tier that required a human and records nothing has not passed its gate>

## Changes registered
<filled on completion: the real diff — paste `git status --short` / `git diff --stat HEAD`, renames, and `git log --oneline <base>..HEAD` when the work spanned commits>

## Notes
<decisions, gotchas, links — [[memory-slug]] for durable takeaways>
<!-- Connector writes: this template carries no such section. When the developer approves a connector write (the connector guard asked and the call ran), the mcp-span hook appends a "Connector writes" section at the end of the newest active record (by file name) if it is absent, and one line per approved call:
     - connector write: `<connector id>` `<tool>` ticket `<ticket>` (<YYYY-MM-DD>)
     <ticket> is the ticket id found in the call's input, else this record's ticket: front matter, else unknown. Keep these lines; they are the approval evidence. -->
