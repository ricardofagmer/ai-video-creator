# Ticket graph: r1-r2-curator-coverage

Spec: `docs/specs/2026-11-21-r1-r2-curator-coverage.md` rev 1. Frozen contract: spec section 8
(harness rev 1), owned by 01.

```mermaid
flowchart LR
  T01[01 coverage harness] --> T02[02 watcher engine]
  T01 --> T03[03 watcher stages and daemon]
  T01 --> T04[04 watcher curation]
  T01 --> T05[05 core agent evals]
  T01 --> T06[06 core curator]
  T01 --> T07[07 core R1 data]
  T01 --> T08[08 core R2 loop]
  T09[09 api routes] --> T11[11 final proof]
  T10[10 CLI and toolbox] --> T11
  T02 --> T11
  T03 --> T11
  T04 --> T11
  T05 --> T11
  T06 --> T11
  T07 --> T11
  T08 --> T11
```

Frontiers:

1. 01, 09, 10 (no blockers)
2. 02 to 08 (after 01)
3. 11 (after 01 to 10)

Every ticket's exclusive paths are disjoint from every other ticket's, so each frontier can run
concurrently up to the parallel cap of 3.
