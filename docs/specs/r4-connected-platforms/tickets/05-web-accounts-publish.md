# 05-web-accounts-publish: Web: Contas page, publish dialog, publications panel (R4-05)

**What to build:** The pt-BR screens: `/contas` with the three platform cards and gate switches, the publish dialog on an approved run with the biometric assets named, and the origin and polling lines on the publications panel.

**Blocked by:** 01-frozen-contracts

**Status:** blocked (waits for its prerequisites)

## Requirements
- AC 44
- AC 46
- AC 49 (SPEC 0007 section 8; PRD 0001 R4 goals 1-3 through SPEC 0007 section 11)

## Technical details
docs/specs/0007-r4-connected-platforms.md sections 5.3, 5.4, 5.9 and the pt-BR texts of 4.4. Route `apps/web/src/app/(studio)/contas/`; features under `apps/web/src/features/platforms/` and `features/publishing/`. Calls go through the BFF and the existing route table (already extended by ticket 01; do not edit it). The connect button navigates the same tab to `authorizeUrl`. The dialog creates the `idempotencyKey` when it opens, disables the button after the first click, and polls `GET /runs/:runId/publish` every 2 s while an attempt is open.

## Acceptance criteria
- [ ] No visibility option is preselected; `aiDisclosure` is preselected only when the view lists a biometric asset.
- [ ] Each biometric asset is shown by title, kind and `id@version`; no path is rendered (AC 46).
- [ ] A capability at `awaiting-review` shows "Aguardando revisão da plataforma" and the note that CSV and form import stay available (AC 44).
- [ ] Mock mode shows "Modo simulado: nada será enviado." and the badge "simulado" on mock publications.
- [ ] "O que saiu da máquina" lists the manifest egress and then the publication lines (AC 49).
- [ ] No `dangerouslySetInnerHTML`; account label, title and caption are rendered as text.

## Testing requirements
None in this ticket. Tests are written and run only at the final gate (ticket 10-final-proof), after the owner's approval. Keep the code testable: inject the clock, the vault, the file root and the platform client.

## Definition of Done
- [ ] No `any`, no `as` cast that silences a type, no `dangerouslySetInnerHTML`, no secret or token literal, no outbound request outside `packages/core/src/platforms/clients/**`, no write of `active`, `approval.json` or `control.json` in the changed files (grep evidence).
- [ ] No edit outside the exclusive paths; no edit to the PRD, SPEC 0007 or the ticket files.
- [ ] Logs and errors carry ids, counts, states and reason ids only: never a token, code, `state`, verifier, URL, title, caption, tag or account label (SPEC 0007 K7).
- [ ] No check, build, test, migration, install or git write was run by this ticket; review evidence is by inspection (SPEC 0007 K12).

## EngineOS brief metadata
- Exclusive paths: `apps/web` except `apps/web/src/lib/api/route-table.ts`
- dependsOn: 01-frozen-contracts
- Owner: frontend-coordinator
- Risk / autonomy: high / A2 inside the exclusive paths; no external effect
- Contracts: `docs/specs/0007-r4-connected-platforms.md` (frozen revision), `docs/RUN-FORMAT.md`, `docs/adr/0003-asset-store-and-run-format.md`, `docs/adr/0007-platform-connections.md`
