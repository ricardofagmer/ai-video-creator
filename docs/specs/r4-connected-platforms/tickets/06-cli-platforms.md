# 06-cli-platforms: CLI: platforms, publish, metrics sync, status, uninstall (R4-06)

**What to build:** The terminal side: list and switch gates, disconnect, publish an approved run with a typed confirmation, sync pulled metrics, and show platform lines in status and doctor; uninstall removes the token items.

**Blocked by:** 02-core-platforms

**Status:** blocked (waits for its prerequisites)

## Requirements
- AC 43
- AC 44
- AC 49 (SPEC 0007 section 8; PRD 0001 R4 goals 1-3 through SPEC 0007 section 11)

## Technical details
docs/specs/0007-r4-connected-platforms.md section 5.9. Commands `studio platforms list|enable|disable|disconnect`, `studio metrics sync`, `studio runs publish <runId> --platform <p>`; `studio secrets set` accepts the six new names; `studio status`, `studio doctor` and `studio runs show` gain the platform and "O que saiu da máquina" lines. `studio runs publish` needs a terminal, prints every biometric asset by name and asks for a typed confirmation; it calls `RequestPublish` with `createdBy: cli`. Connect is web-only; the command says so. `scripts/uninstall.sh` deletes the items of service `com.videostudio.platform-tokens` the way it deletes the provider keys.

## Acceptance criteria
- [ ] `studio runs publish` refuses without a terminal and without the typed confirmation; it never takes the confirmation from a flag.
- [ ] No command prints a token, a client secret or a full URL with a code.
- [ ] `studio platforms list` shows the same status words as the web (AC 44).
- [ ] Uninstall removes all three token items and reports each.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 10-final-proof), after the owner's approval. Keep the code testable: inject the clock, the vault, the file root and the platform client.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret or token literal, no outbound request outside `packages/core/src/platforms/clients/**`, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0007 or the ticket files.
- [ ] Logs and errors carry ids, counts, states and reason ids only: never a token, code, `state`, verifier, URL, title, caption, tag or account label (SPEC 0007 K7).
- [ ] No check, build, test, migration, install or git write was run by this ticket; review evidence is by inspection (SPEC 0007 K12).

## EngineOS brief metadata
- Exclusive paths: `tools/cli`, `scripts/uninstall.sh`
- dependsOn: 02-core-platforms
- Owner: backend-coordinator
- Risk / autonomy: high / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0007-r4-connected-platforms.md` (frozen revision), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`, `docs/adr/0007-platform-connections.md`
