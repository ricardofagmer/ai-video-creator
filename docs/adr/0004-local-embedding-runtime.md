# 0004. Embed catalog text in-process with ONNX Runtime and scan vectors by brute force

Date: 2026-11-18
Status: accepted (owner, 2026-11-21)

Decider: Ricardo Fagmer. Sources: PRD 0001 (`docs/prds/0001-video-studio.md`) D5, D10, section
12, criterion 32; ADR 0003 decision 6 and its revisit list; SPEC 0003
(`docs/specs/0003-r2-improvement-loop.md`) section 5.2; the owner's decision "In-process ONNX"
recorded in `.engineos/changes/2026-11-18-r2-improvement-loop-plan.md` (2026-11-18); the
vetting report `docs/vetting/0001-embedding-runtime.md` and the owner's decision on it, "Approve
option L (Recommended)" (2026-11-18): `onnxruntime-node` 1.31.1 plus `@huggingface/tokenizers`
0.2.0, no hub client.

No network was used to write this ADR. Package names, versions, licences and lifecycle scripts
come from the vetting report's registry reads of 2026-11-18. Statements about the model (revision,
files, sizes, checksums, licence) are still **Candidate**: the committed manifest carries
placeholder pins until they are read from the model host, and the installer and core refuse
placeholders. Measurements are **To measure** (vetting section 9). Statements marked
**Assumption** are defaults chosen here.

Status stays `proposed` until the R2 final proof (R2-FP) confirms the vetting report's phase 2
checks (section 11) and the measurements on the owner's Mac.

## Context

R2 adds catalog search by meaning (PRD section 3 R2, criterion 32). D10 fixes two things: the
embedding model is local, and catalog text never leaves the Mac for embedding. Criterion 32 is
checked with the network disabled.

What the design has to fit:

- One owner, one Mac, Apple Silicon (SPEC 0002 A18). The catalog is small: tens to a few
  thousand asset versions.
- Catalog text is in pt-BR and in English (D16; the two R1 recipes are one of each), and a
  query in one language should find an asset written in the other.
- The stack is Node 22+, NestJS, Prisma + SQLite (ADR 0001). No Python enters the monorepo (D15).
- SQLite is written only by Nest command handlers run by the api or the CLI; the watcher only
  reads it (ADR 0003). So vectors are written by the api or the CLI.
- The api and web run only under `studio start` (D9); launchd manages the watcher alone. A
  search service that must be running separately is one more thing to start and to forget.
- R1 reserved one column for the vector, `asset_versions.embedding_json`, a JSON array of
  numbers, and left it empty (`packages/core/prisma/schema.prisma:81-82`).
- ADR 0003 decision 6 left the vector store open, with `sqlite-vec` as its assumption, "to be
  settled by an R2 ADR". This is that ADR.
- Biometric assets are registered by path and hash and are excluded from agent-readable context
  (PRD section 12). Nothing may read or index the content of a biometric file.

## Options considered

### A. Where the model runs

1. **In-process ONNX** (chosen). An ONNX export of a small sentence-embedding model runs inside
   the Node process that needs it. **Candidate model**: the ONNX export of
   `multilingual-e5-small` (384 dimensions). The vetting report compared two package sets for
   the same runtime:
   - **L. `onnxruntime-node` 1.31.1 plus `@huggingface/tokenizers` 0.2.0** (chosen by the
     owner). Core passes the graph's bytes to ONNX Runtime and two parsed JSON objects to the
     tokenizer, and does mean pooling and L2 normalization itself.
     - Pros: no extra service, port or daemon, so nothing to start, supervise or uninstall; the
       api and the CLI use the same code path; text and vectors never cross a process boundary;
       it works with the network off once the files are on disk; a model swap is a manifest
       change. Neither library has a hub client or a remote switch, so D10 holds by
       construction; one native package (about 308 MB unpacked), one blocked lifecycle script,
       MIT and Apache-2.0 licences only.
     - Cons: core owns the tokenizer-to-tensor plumbing and the pooling (about 40 more lines);
       `@huggingface/tokenizers` is a young 0.x line (0.2.0 released 2026-09-07) whose API the
       vetting could not read offline. See also
       "Honest costs" below.
   - **T. `@huggingface/transformers` 4.3.2** (the original candidate). **Rejected** on the
     vetting report's findings: it brings ONNX Runtime Node and a **nightly** ONNX Runtime Web
     build (`1.31.0-dev`), plus `sharp` with the LGPL-3.0 `libvips` binary, about 480 MB
     unpacked and two lifecycle scripts; it is built to fetch models from the Hugging Face Hub,
     so D10 would rest on about a dozen remote, cache and CDN switches whose option names
     changed across major versions and would have to be re-verified on every upgrade of a
     fast-moving library (four minors in 2026). It is the first fallback if option L fails its
     phase 2 checks.
2. **An Ollama daemon** serving an embedding model over `127.0.0.1`.
   - Pros: the model runs outside our processes, so its memory is not ours and a crash does not
     take the api down; models are swapped with one command; Metal acceleration comes for free.
   - Cons: a second background service to install (Homebrew), start and keep alive, against D9's
     "launchd manages only the watcher"; a local HTTP port that any process on the Mac can call;
     model files live in Ollama's own store, outside the data home and outside our checksum
     pinning; the install grows by a large binary; criterion 32 then depends on a daemon being up.
3. **A remote embedding API** (any hosted provider).
   - Pros: no model on disk, no memory cost, strong models.
   - Cons: it sends catalog text off the Mac. **Rejected: it breaks D10** and cannot pass
     criterion 32 with the network disabled. Not considered further.
4. **A Python sentence-transformers sidecar.**
   - Pros: the widest model choice.
   - Cons: Python in the install, against D15; a second runtime and process. Rejected.

### B. Where vectors live and how they are searched

1. **JSON column plus a brute-force cosine scan in Node** (chosen). Vectors are stored
   unit-normalized in `embedding_json`; a query is one dot product per row.
   - Pros: uses the column R1 reserved, so no extension and no new table; nothing native to
     load into SQLite; exact results, no index to tune or rebuild; trivial to test.
   - Cons: cost grows linearly with rows; parsing JSON vectors dominates a cold scan; no
     approximate index if the catalog ever grows large.
2. **The `sqlite-vec` extension** (ADR 0003's assumption).
   - Pros: nearest-neighbour search inside SQL; binary vector storage; scales further.
   - Cons: a loadable native extension that Prisma's SQLite driver must be made to load in the
     api, the CLI and the watcher's read connection; one more binary to vet and ship for
     Apple Silicon; a virtual table that Prisma migrations do not model, on a database whose
     guards already live in hand-written SQL. For a catalog of this size it buys nothing
     measurable.
3. **A separate vector database.**
   - Pros: the most capable.
   - Cons: another process to install and back up for a few thousand rows. Rejected.

## Decision

1. **Runtime: option A1, package set L.** A small multilingual sentence-embedding model runs
   in-process on `onnxruntime-node` (CPU execution provider) with `@huggingface/tokenizers`, both
   pinned to exact versions, in the **api** and in **CLI** commands. The watcher never loads it.
   The libraries are required on the first load, and the model loads lazily on first use and
   stays in memory for the life of the process. Core's adapter does mean pooling over the
   attention mask and L2 normalization, prepends the manifest's role prefix and runs at most 8
   texts per inference. `onnxruntime-node` gets no `onlyBuiltDependencies` entry: its
   postinstall stays blocked.
2. **Store and search: option B1.** One vector per asset version in `embedding_json`,
   unit-normalized, with three sibling columns (`embedding_model`, `embedding_input_hash`,
   `embedded_at`). Search embeds the query and scans every candidate row by dot product. This
   replaces the `sqlite-vec` assumption of ADR 0003 decision 6.
3. **Provisioning.** Model files live in `<data home>/models/embeddings/<modelRef>/`, a fifth
   data-home folder beside the four of D5. A manifest committed in the repository pins the model
   reference, the source revision and the sha-256 and size of every file. `scripts/install.sh`
   downloads missing files, verifies them and renames them into place; `studio models fetch`
   repeats that step. A failed download does not fail the install (**Assumption**).
4. **No network at index or query time.** Neither library is given a URL, a model id or a cache
   folder: the session is built from the graph's bytes and the tokenizer from parsed JSON, read
   from the model folder only. A missing file is an error, never a fetch. Before the first
   inference of a process every file is re-hashed against the manifest, and the adapter hashes
   the very bytes it hands to the runtime again; a mismatch refuses the load. The installer's
   download source (host, repository, revision) is a second committed file,
   `scripts/models/embedding-model.source.json`, because the manifest schema has no host field.
5. **What is embedded.** Catalog metadata, notes and, for text kinds held in the content store,
   the text body, capped at 2,000 characters. For a `sensitivity: biometric` version: kind,
   name, summary and tags only, and never any read of its file. Vectors never leave the api.
6. **Not asserted here.** The model's revision, file sizes and sha-256 values, and its licence at
   that revision. Until they are read from the model host, the manifest carries placeholder pins
   (an all-zero sha-256, a zero size, `pinState: "placeholder"` in the source file) that the
   installer and core both refuse.

Deciding reasons: (1) D10 and criterion 32 rule out anything remote; (2) for one owner on one
Mac, a library inside processes that already exist is less to install, start, secure and
uninstall than a daemon; (3) at this catalog size an exact scan is fast enough that an index
would be complexity without benefit; (4) the reserved column and the single-writer rule already
fit this shape.

## Honest costs of the chosen option

- **A model download at install.** The feature needs files that are not in the repository.
  The install gains a network step and a dependency on the model host being reachable, and a
  machine that installs offline has no search by meaning until the files are placed. Size is
  **to measure**; the expected order is around a hundred megabytes for a quantized export.
- **Memory.** The model and the ONNX runtime stay resident in the api process (and in a CLI
  command while it runs). **To measure**; the expected order is a few hundred megabytes. This is
  memory the api did not use in R1, on a machine that also renders video.
- **First-load latency.** The first search or the first index run in a process pays the model
  load: reading and hashing the files, then building the session. **To measure**; expected
  around one to a few seconds. Later calls are fast. A CLI search pays it every time.
- **The event loop.** Tokenization and the calls into the runtime happen in the api's process.
  A long index run can delay other api requests. The indexer batches and yields, but it is not
  isolated (**Assumption**: no worker thread in R2).
- **The packages must stay vetted.** `onnxruntime-node` ships a native binary for every
  platform and a postinstall script that stays blocked; every upgrade re-checks that the
  darwin-arm64 binary is in the tarball and that the script still does nothing on macOS.
  `@huggingface/tokenizers` is a 0.x line whose API may change; core narrows its output at run
  time instead of trusting its types.
- **We own the pooling.** Tokenization to tensors, padding, truncation and mean pooling are core
  code, not library code; a model that needs another pooling is an adapter change, not only a
  manifest change.
- **A native runtime parses the model files.** A tampered model file is a code-level risk, which
  is why the checksums are pinned and re-checked at load.
- **Model quality is a bet.** A small multilingual model is weaker than a large one, especially
  across languages and on short catalog text. Criterion 32's test is the measure; failing it
  means a different model, not a different architecture.
- **One short document per version.** Long prompt bodies are cut, and metadata comes first, so
  the tail of a long prompt is not searchable.
- **Brute force has a ceiling.** See the revisit triggers.

## Consequences

Easier:

- Search by meaning works with only `studio start`, or from the CLI with nothing running.
- D10 holds by construction: there is no client for a remote embedding service in the code.
- Swapping the model is a manifest change plus `studio catalog embed --stale`; vectors from
  different models are never compared, because each row records its `embedding_model`.
- No change to backups: vectors are in the SQLite file, and model files are under the data home.
- The watcher, the run format and the agents are untouched.

Harder:

- The install script gains a step, a manifest to maintain and a failure mode to explain.
- Every catalog write that changes an embedding document needs a later index pass; until it
  runs, the row is missing from semantic results. The api reports the count of such rows.
- After a model swap every vector is stale until re-embedded.
- The api's memory and start-up profile change; `studio doctor` has to report the model state.
- `embedding_json` as JSON text is larger and slower to parse than a binary vector.
- ADR 0003 decision 6 needs a pointer to this ADR once it is accepted.

We commit to maintain: the model manifest with its checksums and the source file with its
pinned revision; the rule that the runtime and the tokenizer receive bytes and parsed objects,
never a URL or a model id, re-checked on each library upgrade; the blocked `onnxruntime-node`
postinstall; the rule that the embeddings module never receives a biometric path; the rule that
no api response carries a vector.

## Revisit when

- The catalog passes about 10,000 embedded rows, or the search route's p95 exceeds 200 ms on the
  owner's Mac: adopt binary vector storage first, then `sqlite-vec` (option B2). This keeps the
  threshold ADR 0003 already set.
- The model load takes more than 5 s, or the api's resident memory grows by more than 600 MB
  after the first search: move inference to a worker thread or to the Ollama option (A2).
- An index run makes another api request wait more than 1 s: move inference to a worker thread.
- The criterion 32 fixture ranks the expected asset in the top 3 for fewer than 4 of its 5
  pairs: change the model (manifest only) before changing anything else.
- A phase 2 check of the vetting report fails, or a later release of `onnxruntime-node` or
  `@huggingface/tokenizers` takes a URL where it took bytes or objects, adds a lifecycle script
  that cannot be reviewed, or drops the Apple Silicon binary: try another small multilingual
  model on the same runtime, then package set T, then option A2.
- A process other than the api and the CLI needs search by meaning (for example the watcher's
  `CatalogSearchTool` after a topology amendment): a shared in-process model in two long-lived
  processes doubles the memory, so reconsider option A2.
- Owners report that long prompts are not found by text near their end: add chunked embeddings
  in a separate table.
- A second user, a second Mac or any remote access appears: reopen this ADR together with
  ADR 0003.
