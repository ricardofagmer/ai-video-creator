# 0003. Store assets content-addressed in Application Support and keep run state in single-writer run files

Date: 2026-11-18
Status: accepted (owner, 2026-11-18)

## Context

PRD 0001 fixes the data home at `~/Library/Application Support/VideoStudio/` with `db/`, `assets/`,
`runs/` and `logs/`, outside git (D5), and requires immutable asset versions whose manifests stay
resolvable forever (section 5.4, criteria 6, 8, 9). A run must survive closing the web and the CLI,
resume from the exact step after the watcher is killed, and be paused from one interface and seen
in the other within 2 s (criteria 12, 13, 14). The owner's voice material in
`ai-video-creator/ricardo-clone/` is biometric and must never be copied (criterion 22). The stack
(Prisma + SQLite, pnpm + Turborepo) is ADR 0001; the agents and key handling are ADR 0002. The
reference design is eng-grafo's `.devkit/` format (`tools/FORMATO.md`): one JSON source of truth
per loop, a live snapshot, an event log, a control file, a pid file, atomic tmp+rename writes, and
two interfaces sharing only the on-disk contract.

## Options considered

### A. Where asset bytes live

1. **Content-addressed files** — `assets/sha256/<2 hex>/<hash>`, one file per distinct content; the
   database row holds metadata and `contentHash`.
   - Pros: immutability by construction; identical uploads dedupe; preflight is "file exists and
     re-hashes to its name"; ffmpeg, Remotion and Playwright read plain paths; Time Machine backs
     up unchanged blobs once.
   - Cons: bytes and metadata can drift apart (orphan blobs, rows without a file); no human-readable
     filenames on disk; folder assets (a skill, a template) need a tree manifest.
2. **SQLite blobs** — bytes in the same database as the metadata.
   - Pros: one file, transactional with metadata, no orphans.
   - Cons: video, audio and checkpoints are hundreds of MB to GB; the database balloons, every
     backup recopies it whole, and media tools need a temp-file export before each use.
3. **Path-only references** — the catalog stores the original path of every asset.
   - Pros: zero copy, zero disk growth.
   - Cons: any edit, move or delete silently breaks immutability and past manifests; this is the
     loose-path problem PRD section 1 sets out to remove.

### B. Where run state lives

1. **Run files owned by the watcher, SQLite as index** — `runs/<id>/` holds the state; the database
   holds a rebuildable index of runs.
   - Pros: same shape as eng-grafo, already proven for stop/resume and two interfaces; a run folder
     is self-contained, inspectable with `cat`, and copyable; one writer means no lock protocol.
   - Cons: two stores can drift; readers poll or watch files; no cross-run SQL without the index.
2. **Everything in SQLite** — run state, events and live snapshot as tables.
   - Pros: one source of truth; cross-run queries for the improvement loop come free.
   - Cons: watcher, api and CLI all contend for one database file with a high-frequency event
     writer (WAL helps, does not remove it); the CLI must go through the api or share Prisma; raw
     session streams and check outputs still need files, so the split exists anyway.

## Decision

1. **Asset bytes are content-addressed files (A1).** Layout
   `assets/sha256/<first 2 hex>/<sha-256>`; files are written to a temp name, hashed, then renamed,
   and are never modified afterwards. A version is `assetId@version` → `contentHash`; an edit
   creates version N+1 and a new blob. Deprecation changes `status` only and never deletes bytes.
   Recipes and manifests pin `assetId@version` plus `contentHash`; `preflight` re-hashes every
   bound asset and stops the run with a reason naming the asset on a miss or mismatch.
   **Assumption**: a folder asset is stored as a canonical file list (relative path, size, hash)
   whose own hash is the version's `contentHash`.
2. **Biometric and very large assets are registered by reference.** The row stores an absolute
   path, `contentHash`, `sizeBytes` and `sensitivity`; no byte enters `assets/` or the repository.
   `sensitivity: biometric` rows are excluded from exports and from agent-readable context, and
   their use is never retried automatically (PRD 7.3). A moved or changed target fails `preflight`
   like any other mismatch. **Assumption**: "very large" starts at 2 GB, configurable.
3. **Run files own run state; SQLite owns catalog, recipes, outcomes and a run index (B1).**
   `runs/<id>/` contains `run.json` (source of truth), `plan.md` (export, human reading only),
   `now.json`, `events.jsonl`, `control.json`, `watcher.pid`, `sessions/`, `checks/`, per-stage
   archive folders, and the outputs `final.mp4`, `manifest.json`, `cost.json`, `qa/`, `report.md`.
   One writer at a time per run, always through the atomic-write helper (`<file>.tmp-<pid>` then
   rename, UTF-8); `events.jsonl` is append-only. Web (through the api) and CLI read the same files.
   The index is derived: `studio doctor` can rebuild it from the run folders, and on disagreement
   the files win. Who writes what is fixed below.
4. **Content-hash snapshots replace eng-grafo's git commits.** The `snapshot` step writes the
   stage's input manifest and the `record` step hashes its outputs into `run.json`; a run folder
   is not a git repository.
5. **The format is a versioned contract.** `run.json` carries `format: 1`. `docs/RUN-FORMAT.md`
   (to be written) documents every file, field and status. Adding an optional field keeps the
   number; renaming, removing or changing the meaning of a field bumps it, and a reader that meets
   a higher number refuses the run with a named error instead of guessing.
6. **Embeddings are local and stored beside the catalog rows.** R1 reserves the `embedding` field
   and leaves it empty; R2 fills it with a local model (D10). **Assumption**, to be settled by an
   R2 ADR: the store is `sqlite-vec` in the same database (one file, no new service) rather than a
   BLOB column with brute-force cosine in Node (simplest, fine for a few thousand rows) or a
   separate vector database (more capable, one more process to install and back up).

Deciding reasons: media tools need real file paths and blobs would bloat the database; the
watcher-owned file format is the part of eng-grafo that already delivers resume and two
interfaces; and a single writer is the cheapest answer to the drift risk the PRD names (section 15).

## Consequences

Easier:

- Criteria 6, 8 and 9 reduce to hash checks; criteria 12-14 reduce to file reads and one writer.
- A run folder is a complete audit record and can be zipped for inspection without the database.
- Offline mock runs need no service beyond the watcher.

Harder:

- Referenced assets must be re-hashed at every `preflight`; a multi-GB checkpoint costs seconds to
  minutes. **Assumption**: cache the hash keyed by size and mtime, with a full re-hash on demand.
- Orphan blobs accumulate (abandoned drafts, failed uploads). **Assumption**: a `studio gc`
  command removes only blobs referenced by no version and no manifest, lists them first, and
  never touches referenced paths or `deprecated` versions.
- Disk grows without bound by design (deprecate never deletes; each run keeps its MP4 and session
  streams). Time Machine covers Application Support but not necessarily referenced paths outside
  it; `studio doctor` should report store size and unreachable references.
- Nothing may log or index file contents of biometric paths; secrets must stay out of `run.json`,
  `events.jsonl`, `sessions/` and `cost.json` (criterion 21), which needs a redaction rule at the
  session-stream writer.
- Cross-run analysis for R2 depends on the index being complete and current.

We commit to maintain: `docs/RUN-FORMAT.md` as the contract, with the zod schemas in
`packages/shared` as its executable form; the index rebuild; the atomic-write helper as the only
way run files are written.

Who writes what (follows eng-grafo's `FORMATO.md`; field detail goes to `docs/RUN-FORMAT.md`):

| File or store | Writer | Rule |
|---|---|---|
| `run.json` (draft, `pending`) | api (for the web) or CLI | Created before any watcher runs; only `draft` → `pending` |
| `run.json`, `now.json`, `events.jsonl`, `sessions/`, `checks/`, outputs | Watcher | Sole writer while its `watcher.pid` is alive |
| `control.json` | api or CLI | Request channel `{ pause, stop, at }`; the watcher reads it between steps and deletes it at start |
| `approval.json` + `run.json` status `review` → `approved` / `rejected` | api or CLI | Only at `review` with no live watcher; the same outcome is written to SQLite |
| `approval.json` gate decisions (`plan`, recipe gates, `final`) and the optional `resume` flag in `control.json` | api or CLI | Amended 2026-11-18 (SPEC 0002 A6, K2): optional fields, `format: 1` unchanged; written only while no watcher step is in progress |
| `run.json` status `running` → `rejected` at the plan gate | Watcher | Amended 2026-11-18 (SPEC 0002 rev 3): the watcher holds the run at the plan gate, so it applies the owner's `rejected` plan decision read from `approval.json` and ends the run |
| `egress.jsonl` | Watcher | Amended 2026-11-18 (SPEC 0002 rev 3): append-only, one line per external call, written through the C5 helper; `package` copies it into `manifest.json.egress` |
| `run.json` created at `pending` with `createdBy: 'watcher'` and `schedule` | Watcher | Amended 2026-11-19 (SPEC 0006 section 4.6, L1): only from a due slot of an `active` schedule, only when no run is startable; one write, then the ordinary rules apply |
| `schedules/<id>/schedule.json` | api or CLI | Amended 2026-11-19 (SPEC 0006 section 4.6): atomic rewrite; `deleted` is a status, the folder is never removed by code |
| `schedules/<id>/cursor.json`, `slots.jsonl` | Watcher | Amended 2026-11-19 (SPEC 0006 section 4.6): written only between runs, under `fire.lock` |
| `schedules/<id>/fire.lock`, `fire.lock.takeover` | Watcher | Amended 2026-11-19 (SPEC 0006 section 4.6, R3 security review L1 and M1): held for one evaluation of one schedule; a stale lock is replaced only under `fire.lock.takeover` |
| `schedules/<id>/fired/<slotMs>` | Watcher | Amended 2026-11-19 (SPEC 0006 section 4.6, R3 security re-review 2): O_EXCL claim created before the slot's run is written, so a slot is fired at most once |
| SQLite (catalog, recipes, outcomes, run index) | Nest command handlers, run by the api or by the CLI booting the same modules | The watcher only reads it (asset resolution, month-to-date spend); the api resyncs the run index from run folders on start |
| SQLite `run_publications`, `platform_metric_snapshots`, `metric_imports`, quality columns | Nest command handlers (api or CLI) | Amended 2026-11-19 (SPEC 0006 section 4.6, K1): the watcher does not read or write them |
| Mastra storage | None | Agents run inside one step and keep no state of their own (D18, ADR 0002) |

`cost.json` sessions also carry cache read and cache write tokens when the provider reports them
(ADR 0002).

Revisit when:

- `assets/` plus `runs/` exceeds 50 GB or 25% of free disk: adopt a retention policy for run
  intermediates (session streams, stage archives), never for manifests or approved outputs.
- The run count passes about 1,000 or an index rebuild takes over 10 s: reconsider moving closed
  runs' state into SQLite.
- A second user, a second Mac or any remote access appears: single-writer files and absolute
  reference paths stop being safe; reopen this ADR.
- The index and the run files disagree in practice more than once: tighten or drop the index.
- The catalog passes about 10,000 embedded rows or search takes over 200 ms: revisit the vector
  store choice.
- A blob fails its hash with no user action (disk corruption): add scheduled verification.

## Rev 4 addition: watcher heartbeat file

Added 2026-11-18 (SPEC 0002 rev 4, section 13.3; owner decision recorded in
`.engineos/changes/2026-11-18-r1-rev4-contract-additions.md`). This is an addition to the
"Who writes what" table, not a change of ownership: no existing file changes writer, and the
api and CLI gain no write.

| File or store | Writer | Rule |
|---|---|---|
| `<data home>/logs/watcher.heartbeat.json` | Watcher | New single-writer file, outside any run folder. Content `{ format: 1, at }`: no pid, no run id, no path. Written through the atomic-write helper at daemon start and every 2 s, on a timer independent of the run loop; never deleted. The api only reads it to answer `GET /watcher` (fresh within 10 s is `alive`, older is `dead`, missing is `absent`) and never signals or inspects a process |

The per-run `watcher.pid` rule is unchanged: it still decides who owns one run. The heartbeat
says only that the daemon process is running.
