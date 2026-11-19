# Vetting 0001: local embedding runtime and model (SPEC 0003 R2-03, ADR 0004)

Date: 2026-11-18. Author: backend-coordinator (R2-03 phase 1). Status: **awaiting owner decision**.

Sources: `npm view` read-only registry lookups made on 2026-11-18 (results quoted below), SPEC 0003
section 5.2 "Vetting", ADR 0004. Nothing was installed, packed or downloaded, and no tarball, model
file or upstream web page was opened. So:

- **Registry** marks a value read from the npm registry on 2026-11-18. The registry's
  `maintainers`, `repository`, `license` and `scripts` fields are publisher-supplied claims; only
  the `dist` integrity and signatures are registry-generated.
- **Unverified** marks a statement from general knowledge, or one that needs the installed files,
  the upstream repository or the model host. Each one has a phase 2 check.
- **To measure** marks the four numbers spec 5.2 wants measured on the owner's Mac.

## 1. Summary

| Question | Answer |
|---|---|
| Candidate package | `@huggingface/transformers` **4.3.2** (latest, 2026-10-27), Apache-2.0 (**Registry**) |
| Native code it brings | `onnxruntime-node` 1.30.0 (exact pin, about 301 MB unpacked, `postinstall: node ./script/install`), `sharp` 0.35.x (with the LGPL-3.0 `libvips` binary), `onnxruntime-web` **nightly** `1.31.0-dev.20260914` (about 145 MB) (**Registry**) |
| Lifecycle scripts in the tree | `onnxruntime-node` `postinstall`, `protobufjs@7` `postinstall`; none in `@huggingface/transformers`, `sharp` 0.35 or the `@img/*` binaries (**Registry**) |
| `onlyBuiltDependencies` entry needed | Proposed: **none**. Both scripts stay blocked (pnpm 10 default); the darwin-arm64 binary is expected inside the `onnxruntime-node` tarball (**Unverified**, phase 2 check 3) |
| Install footprint | About 480 MB unpacked across the tree, about 450 MB of it ONNX Runtime for every platform (**Registry** sizes, summed) |
| Remote switches | Hub model download, remote file resolution, file-system cache writes, browser cache and the WASM CDN fallback; each is switched off in the adapter (section 5). Exact v4 option names are **Unverified** |
| Candidate model | ONNX export of `intfloat/multilingual-e5-small`, 384 dimensions, `query: ` / `passage: ` prefixes, int8 quantized (**Unverified**: revision, file list, sizes, sha-256, licence) |
| Download host | `https://huggingface.co/<repo>/resolve/<40-hex commit>/<file>`, with redirects to Hugging Face's own CDN hosts (**Unverified** host names) |
| Recommendation | Approve **option L** (section 7): `onnxruntime-node` + `@huggingface/tokenizers` directly. Fall back to the ADR 0004 candidate (option T) if the owner prefers the library's pooling and loading code |

## 2. Package identity and publisher

| Field | Value |
|---|---|
| Name | `@huggingface/transformers` (scope `@huggingface`) |
| Latest | 4.3.2, published 2026-10-27T18:15:37Z; `next` tag 4.4.0-next.0 (2026-10-30). Line: 4.0.0 (2026-03-30), 4.1.0, 4.2.0, 4.3.0 (2026-09-16), 4.3.1 (2026-10-06), 4.3.2 |
| Package created | 2024-08-08 (the v3 rename from `@xenova/transformers`) |
| Maintainers | `julien-c`, `pierric`, `coyotte508`, `xenova` (admin@xenova.com), `gary149` (v@huggingface.co). `xenova` is the library's original author; the others are Hugging Face accounts (**Registry**, identities **Unverified**) |
| Repository field | `git+https://github.com/huggingface/transformers.js.git`; homepage the same repository |
| Registry signature | `dist.signatures` present (npm ECDSA key `SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`) |
| Provenance attestation | **None** on `@huggingface/transformers` 4.3.2 or on `onnxruntime-node` 1.30.0 (`dist.attestations` empty). Present on `sharp`'s `@img/*` packages, `semver`, `global-agent` |
| Tarball | `transformers-4.3.2.tgz`, integrity `sha512-V3+dqf3iWlRYJ9I9GreM3zGQd0lAXnnoPeddmkOQYWAEE4l/+Fi6p7tx/qVUJlKQgLXGim2W76rTOzz+eC0i7g==`, 1,372 files, 9,990,867 bytes unpacked |
| Entry points | `type: module`; `exports.node.require` -> `./dist/transformers.node.cjs` (core compiles to CommonJS, so this is the build core would load) |
| Upstream install command | **Unverified.** Direction-of-trust rule (`supermatt:dependency-vetting`): the owner or phase 2 opens `huggingface.co/docs/transformers.js` or the GitHub README and confirms it publishes `npm i @huggingface/transformers`. Phase 2 also runs `npm audit signatures` after install |

## 3. Licences

| Package | Licence (**Registry**) | Note |
|---|---|---|
| `@huggingface/transformers` | Apache-2.0 | |
| `onnxruntime-node`, `onnxruntime-web`, `onnxruntime-common` | MIT | Microsoft |
| `@huggingface/tokenizers`, `@huggingface/jinja` | Apache-2.0, MIT | |
| `sharp`, `@img/sharp-darwin-arm64` | Apache-2.0 | |
| `@img/sharp-libvips-darwin-arm64` 1.3.4 | **LGPL-3.0-or-later** | A dynamically loaded library, used locally and never redistributed by this project. Fine for one owner on one Mac; worth knowing before any redistribution |
| `protobufjs`, `global-agent` | BSD-3-Clause | |
| others in the tree | MIT, ISC, Apache-2.0 | |
| Candidate model `intfloat/multilingual-e5-small` | MIT (**Unverified**; read the model card at the pinned revision) | The ONNX export repository may carry its own licence field (**Unverified**) |

## 4. Dependencies, lifecycle scripts and size

Direct dependencies of `@huggingface/transformers` 4.3.2 (**Registry**):

| Dependency | Range | Resolved today | Scripts | Unpacked | Note |
|---|---|---|---|---|---|
| `onnxruntime-node` | `1.30.0` (exact) | 1.30.0 (2026-09-14); latest is 1.31.1 | **`postinstall: node ./script/install`** | 301,068,136 B | deps `adm-zip ^0.6.0`, `global-agent ^4.1.3`, `onnxruntime-common 1.30.0`; `os: win32, darwin, linux` |
| `onnxruntime-web` | `1.31.0-dev.20260914-8d85527a0` (exact) | a **nightly** pre-release | none | 144,895,056 B | deps `long`, `platform`, `protobufjs ^7.2.4`, `flatbuffers`, `guid-typescript`, `onnxruntime-common 1.31.0-dev.20260911`. Unused at runtime in Node when the CPU node backend is forced, but installed |
| `sharp` | `^0.35.4` | 0.35.5 (2026-09-27) | none | 962,168 B | optional `@img/sharp-darwin-arm64` (292 KB) and `@img/sharp-libvips-darwin-arm64` (18.2 MB) on this Mac. Image decoding only; text embedding does not need it |
| `@huggingface/jinja` | `^0.5.10` | 0.5.13 (2026-11-12) | none | 424 KB | chat templates; unused for embeddings |
| `@huggingface/tokenizers` | `^0.2.0` | 0.2.0 (2026-09-07) | none | 361 KB | pure JS tokenizers |

Lifecycle scripts found in the tree (**Registry**, by range resolution):

| Package | Script | What it is believed to do | Proposal |
|---|---|---|---|
| `onnxruntime-node` 1.30.0 | `postinstall: node ./script/install` | Downloads extra execution-provider binaries (CUDA/TensorRT) on Linux x64 and does nothing on macOS; `adm-zip` and `global-agent` serve that script (**Unverified**) | Leave it blocked; do not add to `onlyBuiltDependencies`. Phase 2 reads `script/install.js` in the store before deciding otherwise |
| `protobufjs` 7.6.6 (via `onnxruntime-web`) | `postinstall: node scripts/postinstall` | A check for its `pbjs` CLI dependencies (**Unverified**) | Leave it blocked |

Transitive count: about 40 to 45 packages (my estimate from the ranges above: `global-agent`
brings `matcher`, `globalthis`, `serialize-error` and their small dependencies; `protobufjs@7`
brings about ten `@protobufjs/*` packages and `@types/node`). The exact count comes only from
the lockfile in phase 2 (**Unverified**).

Size: about 480 MB unpacked in `node_modules` (301 MB ONNX Runtime Node with binaries for three
operating systems, 145 MB ONNX Runtime Web, 18 MB libvips, about 15 MB the rest). This is disk on
the owner's Mac, not memory.

## 5. Every network switch, and how the adapter turns it off

The library is built to fetch models from the Hugging Face Hub by default. Option names are those
of the v3 line; they must be re-read in the installed 4.3.2 `env` and `from_pretrained` sources
(**Unverified**, phase 2 check 4). The phase 2 adapter sets each one before the first load.

| # | Switch | Default | Adapter setting | Why |
|---|---|---|---|---|
| 1 | `env.allowRemoteModels` | `true` | `false` | No hub download of any model file |
| 2 | `from_pretrained(..., { local_files_only })` | `false` | `true` | A missing file is an error, never a fetch (spec 5.2) |
| 3 | `env.allowLocalModels` | `true` in Node | `true` | Local folder is the only source |
| 4 | `env.localModelPath` | `/models/` | `<data home>/models/embeddings/` | Resolves the model id `<modelRef>` to its pinned folder |
| 5 | `env.remoteHost`, `env.remotePathTemplate` | `https://huggingface.co/`, `{model}/resolve/{revision}/` | Left unused (1 and 2 make them dead); optionally pointed at `https://invalid.invalid/` as a tripwire | Defence in depth |
| 6 | `env.useFSCache`, `env.cacheDir` | `true`, `./.cache` under the package | `false`, and `cacheDir` = the model folder | No writes into `node_modules` or the model folder |
| 7 | `env.useBrowserCache`, `env.useCustomCache` | browser only, `false` | `false`, `false` | No other cache layer |
| 8 | `env.backends.onnx.wasm.wasmPaths` | a jsDelivr CDN URL when the WASM backend is used | Force `device: 'cpu'` (the Node backend), and point `wasmPaths` at the local `onnxruntime-web/dist/` | The WASM backend would fetch `.wasm` files from a CDN |
| 9 | A custom `fetch` hook (`env.fetch` or similar), if 4.x has one | global `fetch` | Replace with a function that throws a refusal error | Turns any missed path into an error instead of a request (**Unverified** that it exists) |
| 10 | `onnxruntime-node` inference | no network | nothing to set | Loads the session from a local file |
| 11 | `onnxruntime-node` postinstall download | runs on install | blocked by pnpm (section 4) | Install-time only |
| 12 | `global-agent` | patches Node's HTTP agents only when bootstrapped | not bootstrapped by core; phase 2 greps that the runtime build does not require it | |

The criterion 32 test (R2-AC-06) blocks every non-loopback socket in the test process, so any
switch this table misses fails the final gate rather than leaking.

## 6. Candidate model

| Field | Value |
|---|---|
| Upstream model | `intfloat/multilingual-e5-small` (**Unverified**) |
| ONNX export | `Xenova/multilingual-e5-small` (it may since have moved to `onnx-community/`; **Unverified**) |
| Licence | MIT upstream (**Unverified**) |
| Dimensions | 384 |
| Languages | about 100, Portuguese and English included (**Unverified**) |
| Max input | 512 tokens; `maxInputTokens: 512` in the manifest |
| Prefixes | `queryPrefix: "query: "`, `passagePrefix: "passage: "` |
| Pooling | mean pooling over the attention mask, then L2 normalization (core normalizes again) |
| Weights | `onnx/model_quantized.onnx`, int8, about 118 MB; fp32 `onnx/model.onnx` about 470 MB (**Unverified**) |
| Files the runtime needs | `config.json`, `tokenizer.json` (about 17 MB, the 250k XLM-R vocabulary), `tokenizer_config.json`, `special_tokens_map.json`, `onnx/model_quantized.onnx` (**Unverified**; phase 2 confirms by loading with `local_files_only` and every other file absent) |
| Pinned revision | **Unverified.** Phase 2 reads the repository's current commit (40 hex characters) once |
| sha-256 and sizes | **Unverified.** For LFS files the Hub API tree lists `lfs.oid` (a sha-256); small non-LFS files list a git blob id, so phase 2 downloads them once, hashes them locally, and records the values |
| `modelRef` | `multilingual-e5-small-q8@<commit>`. The frozen schema needs one path segment matching `^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._-]*$`, so the repository id (it has a `/`) cannot be the model id part; the repository id goes in the installer's source file instead (section 8) |

## 7. Two ways to run the same model

Both are ADR 0004 option A1 (in-process ONNX); only the package set differs.

| | Option T: `@huggingface/transformers` 4.3.2 (the ADR candidate) | Option L: `onnxruntime-node` 1.31.1 + `@huggingface/tokenizers` 0.2.0 |
|---|---|---|
| Native code | ORT Node, ORT Web (nightly), sharp + libvips | ORT Node only |
| Unpacked size | about 480 MB | about 308 MB |
| Lifecycle scripts | 2, both blocked | 1 (`onnxruntime-node` postinstall), blocked |
| Remote switches | the 12 of section 5 | none in the libraries: core passes a file path to ORT and a parsed JSON object to the tokenizer. There is no hub client in the tree |
| Code we own | the adapter (about 80 lines) | the adapter plus mean pooling over the attention mask (about 40 more lines) |
| Maturity | widely used; fast-moving (4 minors in 2026) | ORT is mature; `@huggingface/tokenizers` is 0.x, released 2026-09-07 (API **Unverified**) |
| Licence surprises | LGPL libvips | none |

Recommendation: **option L**. D10 then holds by construction, with no switch to keep re-checking
on every upgrade (ADR 0004 "Honest costs"), half the native code and no nightly build. The cost is
owning tokenizer-to-tensor plumbing and pooling. Core does not change: the port, integrity check,
indexer and search are the same for both options.

## 8. Pinned download host and the installer source file

The frozen `EmbeddingModelManifestSchema` is strict and has no field for a host or repository, so
phase 2 adds a second committed file the installer and `studio models fetch` read:
`scripts/models/embedding-model.source.json`, for example
`{ "host": "https://huggingface.co", "repository": "Xenova/multilingual-e5-small", "revision": "<the 40-hex commit of modelRef>" }`.

- URL per file: `https://huggingface.co/<repository>/resolve/<revision>/<path>`; curl with
  `--proto '=https' --proto-redir '=https' --location`, since LFS files redirect to Hugging Face
  CDN hosts (today under `*.hf.co`, **Unverified**). Integrity rests on the pinned sha-256, not on
  the host.
- The request carries no cookie, token or catalog data; no Hugging Face account is needed.

## 9. Measurements on the owner's Mac (spec 5.2)

| Measure | Value | How (phase 2, with the owner's approval of the run) |
|---|---|---|
| Disk size of the model folder | **To measure** (expected about 140 MB) | `du -sh` of the folder |
| First-load time (hash + session) | **To measure** (ADR revisit trigger: 5 s) | `embeddings.model-loaded` `loadMs` |
| Resident memory after load | **To measure** (ADR revisit trigger: +600 MB) | `process.memoryUsage().rss` before and after |
| Time to embed one query, and one 2,000-character document | **To measure** | timing around `port.embed` |

## 10. Fallback

1. Another small multilingual model on the same runtime, by manifest only, for example an ONNX
   export of `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (384 dimensions,
   Apache-2.0, no prefixes; **Unverified**).
2. If the option chosen in section 7 is rejected, the other option.
3. ADR 0004 option A2 (Ollama on `127.0.0.1`), which reopens the ADR.

## 11. Phase 2 checks before the dependency lands

1. Confirm the upstream install command and repository from the project's own docs (section 2).
2. `pnpm add` with the exact version, then `npm audit signatures`; compare the resolved tree with
   section 4 and stop on any new lifecycle script.
3. Confirm the darwin-arm64 ONNX Runtime binary is in the installed `onnxruntime-node` package
   with its postinstall blocked; read `script/install.js` once and record what it does.
4. Read the installed `env` and `from_pretrained` sources (option T) and confirm every switch in
   section 5 by name; or, for option L, confirm the ORT and tokenizer APIs take a path and an
   object and never a URL.
5. Read the model repository's commit, file list, sizes and sha-256 values into the manifest.
6. The four measurements of section 9.

## Owner decision needed: approve / reject

Approve option **L** (recommended) or option **T**, with the candidate model of section 6, and no
`onlyBuiltDependencies` entry. Rejecting both returns R2-03 `BLOCKED` and reopens ADR 0004 (Q3).
