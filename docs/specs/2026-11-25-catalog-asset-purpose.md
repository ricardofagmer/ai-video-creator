# Spec index: catalog asset purpose

Status: planning sealed (owner approved 7 tickets, 2026-11-25). Contract revision: `plan-rev1`.

| Artifact | Path |
|---|---|
| PRD | `docs/prds/2026-11-25-catalog-asset-purpose.md` |
| ADR | `docs/adr/0012-asset-purpose-text.md` (amends ADR 0003 decision 2) |
| Plan (frozen rev 1) | `.specs/features/catalog-asset-purpose/plan.md` |
| Proposed final evidence | `.specs/features/catalog-asset-purpose/checks.md` |
| Tickets | `docs/specs/catalog-asset-purpose/tickets/` |
| Implementation graph | `docs/specs/catalog-asset-purpose/units.json` |
| Change record | `.engineos/changes/2026-11-25-catalog-asset-purpose.md` |

## Graph

- `01-purpose-tracer-bullet` blocks every other ticket.
- `02-purpose-content-readers`, `03-purpose-owner-edit`, `04-purpose-hover-and-copy`,
  `05-purpose-backfill` and `06-purpose-agent-tools` depend on 01 only. Their exclusive paths
  are disjoint, so they run in parallel once 01 integrates.
- `07-final-proof` depends on 01 to 06. It sits outside the implementation graph and waits for the
  owner's final-checkpoint approval.

All acceptance ids AP-01 to AP-14 are covered by tickets 01 to 06.
