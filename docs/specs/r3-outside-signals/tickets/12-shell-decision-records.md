# 12-shell-decision-records: ADR 0001 amendment, D9 amendment record, ADR 0005 decision record, R3-AC-25 criteria (R3-08 part 2)

**What to build:** The written record of what R3-08 decided and delivered: the amendment to ADR 0001 (processes row and the fired revisit trigger), the amended wording of D9, the decision record in ADR 0005 pointing at vetting 0002, the concrete R3-AC-25 criteria, and a short owner-facing README for the shell.

**Blocked by:** 09-shell-dependencies, 10-shell-tray-app, 11-shell-packaging-install

**Status:** ready-for-agent

## Requirements
- R3-AC-25.11, and the written form of R3-AC-25.1 to 25.12 (SPEC 0006 section 8: "the criteria written in R3-08 once the owner answers Q1"; section 9 R3-08: "D9 and ADR 0001 amended"; section 11: ADR 0001 revisit trigger; section 14 L7)

## Technical details
Read: `docs/adr/0001-stack-and-monorepo.md` (the "Processes" row of the sub-decisions table, the consequence "The owner must run `studio start` after a reboot", the last revisit trigger); `docs/adr/0005-packaged-shell.md`; `docs/vetting/0002-shell-runtime.md` including section 12; `R3-08-graph.md` (the canonical R3-AC-25 list); the return envelopes of tickets 09, 10 and 11 (their recorded decisions are the source for this ticket; do not restate a default as a fact when the worker chose otherwise); how ADR 0003 records its amendments (follow that form).

SPEC 0006 is **frozen at rev 1** (its header, line 3) and is not edited. PRD 0001 is not edited by any ticket of this release. So:

1. **`docs/adr/0001-stack-and-monorepo.md`: append-only amendment.** Add one section at the end, `## Amendment 2026-11-19 (R3-08, ADR 0005)`. No existing line changes, including the status line. Content:
   - The last revisit trigger ("A packaged `.app` is approved for R3") fired; ADR 0005 is the reopening and its outcome is A2 + B1 + C1.
   - The processes decision now reads: launchd manages only `apps/watcher`; web and api run under `studio start` / `studio stop` **or the menu-bar shell**, which invokes the same `studio` binary.
   - The CLI row's rejected alternative ("Desktop shell (`.app`): not in R1 (D4)") is superseded for R3 by ADR 0005: a thin menu-bar shell, not a window.
   - The consequence "The owner must run `studio start` after a reboot" is softened: with the shell registered as a login item, "Iniciar" is one click; the shell does not start the services by itself at login unless ticket 10 recorded otherwise (state what ticket 10 actually built).
   - `onlyBuiltDependencies` is unchanged, so the pnpm revisit trigger did not fire (vetting section 6).
   - A new workspace `apps/shell` joins the layout; "one language and one runtime" still holds for the code (TypeScript), with Electron as a build-time dependency and a bundled runtime in the local `.app`.
2. **D9 amendment record.** D9 lives in PRD 0001 section 0, which this ticket does not edit. Record the amended wording verbatim, as ADR 0005 decision 4 gives it, in both the ADR 0001 amendment and ADR 0005: "launchd manages only the watcher. The web and api start with `studio start` or from the menu-bar shell, and stop with `studio stop` or from the shell." State that PRD 0001's D9 row and its section 11 row ("Web and api") still carry the R1 wording and that the ADRs are the amending record, per SPEC 0006 L7. Whether the PRD rows themselves are edited is the owner's call and is listed in the return envelope as a follow-up, not done here.
3. **`docs/adr/0005-packaged-shell.md`.**
   - Status line: keep "proposed" and the Q1 answer; add that vetting 0002 was approved with option P on 2026-11-19 and that R3-08 part 2 was implemented by tickets 09 to 12. Do not write "accepted": acceptance follows the owner's review, as the current line says.
   - Append `## Decision record (R3-08)`: the three exact pins and where they live; no `onlyBuiltDependencies` entry; service control by invoking the `studio` binary, with `tools/cli/src/services/**` untouched (this answers the "Harder" item that left the choice to R3-08); framework download build-only, by `@electron/packager`, from GitHub releases of `electron/electron`, announced and confirmed in `scripts/install.sh`; the baked `shell-config.json`; the bundle id, app name and install location; the login-item behaviour and how uninstall removes it; the shell read-only in the data home; the provider-mode difference of a shell-started api recorded by ticket 10; every decision the workers of tickets 09 to 11 recorded.
   - Append `## Acceptance criteria (SPEC 0006 R3-AC-25)`: the twelve criteria of `R3-08-graph.md`, verbatim, each with its ticket and its evidence kind (test, grep, diff, inspection, owner-run).
   - Append `## Evidence pending at the final gate (owner-run)`: phase 2 checks 5, 7 and 8 with their commands and the two measured revisit triggers (idle memory over 300 MB, bundle over 400 MB). Written as pending. They become results only when the owner has run them, and then they are recorded in the vetting report, not by this ticket.
   - The "Unverified" statements in the existing body are left as written; where vetting section 12 confirmed or corrected one, the decision record says so and points at the section. Existing sections are not rewritten.
4. **`apps/shell/README.md`** (new, pt-BR, owner-facing, short): what the menu shows, the three actions, that the watcher is not controlled from the shell, how to install (`scripts/install.sh`), skip (`--skip-shell`) and remove it (`scripts/uninstall.sh`), that nothing is sent off the Mac and there is no auto-update, and how updates arrive (the checkout plus the installer). No secret, no token, no personal path.

## Acceptance criteria
- [ ] `git diff` of `docs/adr/0001-stack-and-monorepo.md` is additions after the last existing line only, and the new section contains the amended processes sentence and the fired trigger.
- [ ] The amended D9 sentence appears verbatim in both ADRs and matches ADR 0005 decision 4 character for character.
- [ ] `docs/adr/0005-packaged-shell.md` contains the three new sections; its status line still says "proposed" and names vetting 0002, option P and the date.
- [ ] The twelve R3-AC-25 criteria in ADR 0005 are identical to the list in `R3-08-graph.md` (same numbers, same wording).
- [ ] Checks 5, 7 and 8 appear only under "Evidence pending at the final gate (owner-run)" and nowhere as passed.
- [ ] Every decision recorded in the return envelopes of tickets 09, 10 and 11 appears in the decision record; none is contradicted.
- [ ] `docs/specs/0006-r3-outside-signals-and-packaging.md`, `docs/prds/0001-video-studio.md` and `docs/vetting/0002-shell-runtime.md` are unchanged (diff evidence).
- [ ] `apps/shell/README.md` exists, is in pt-BR, and names the labels "Iniciar", "Parar" and "Abrir estúdio" exactly.

## Testing requirements
Documentation only; review-only ticket. Evidence is the diff of the three files.

## Definition of Done
- [ ] Every per-ticket check in the approved check plan passes at its final attempt.
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret, no outbound request, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0006, the ticket files, `docs/RUN-FORMAT.md`, ADR 0003 or the vetting report.
- [ ] Logs and errors carry ids, counts and reasons only: never a URL, a file name, a CSV cell or brief text (SPEC 0006 K7).
- [ ] ADR text in English, as the existing ADRs; the README in pt-BR (D16).
- [ ] No install, no build, no git write.

## EngineOS brief metadata
- Exclusive paths: `docs/adr/0001-stack-and-monorepo.md` (append-only amendment), `docs/adr/0005-packaged-shell.md`, `apps/shell/README.md`
- dependsOn: 09-shell-dependencies, 10-shell-tray-app, 11-shell-packaging-install
- Owner: backend-coordinator
- Risk: low (documentation), inside a high-risk release
- Contracts: `docs/specs/0006-r3-outside-signals-and-packaging.md` rev 1 (frozen), `docs/prds/0001-video-studio.md` (not edited), `docs/vetting/0002-shell-runtime.md`, `docs/specs/r3-outside-signals/tickets/R3-08-graph.md`
