# 0002. Run the studio's agents with Mastra and the Claude API inside NestJS providers

Date: 2026-11-18
Status: accepted (owner, 2026-11-18)

## Context

PRD 0001 fixes the AI engine as Mastra agents calling the Claude API, hosted in NestJS providers
(D3), with runs executed by a launchd watcher that must survive closing the web and CLI (D4, D9).
This departs from `ai-creator-engine` ADR 0002 (2026-11-16, accepted), which decided that Claude Code
itself orchestrates production through the `fagmer-video-producer` wizard and stage skills, with no
Claude API and no server in R1. Its reasons: the owner wanted the skills to steer output, and no
second per-token bill or separate prompt set. Its recorded cost: "no unattended production", which is
now PRD problem 5 (closing the session stops the work, no resume from an exact step). eng-grafo
reaches unattended runs another way (`tools/FORMATO.md`): each session is a fresh `claude -p` process
with `--output-format stream-json`, `--dangerously-skip-permissions` plus a deny list, an optional
`--json-schema`, and retries after 30 s and 2 min (10 min on `rate limit|usage limit|overloaded|429|529`).
PRD section 12 says that permission pattern must not be copied blindly.

Sources, accessed 2026-11-18: Mastra docs via Context7 `/mastra-ai/mastra` (`createTool` with zod
`inputSchema`/`outputSchema`; `agent.generate(..., { structuredOutput: { schema } })`;
`providerOptions.anthropic.cacheControl`; `createWorkflow`/`createStep`; `@mastra/nestjs`
`MastraModule.register({ mastra })` and the `MASTRA` injection token). Claude model ids as supplied
by the owner: `claude-fable-5-2`, `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`.

This ADR applies to `video-studio` only. `ai-creator-engine` ADR 0002 stays in force in that
repository while it keeps running (D13). Stack and monorepo are ADR 0001; run files are ADR 0003.

## Options considered

1. **Claude Code CLI sessions** (`claude -p`, as eng-grafo and in the spirit of `ai-creator-engine` ADR 0002).
   - Pros: no API key to store; billed to the existing subscription; skills and stream-json logs
     work as they do today; eng-grafo proves the watcher pattern.
   - Cons: needs Claude Code installed and logged in on the Mac; tool control is coarse (skip all
     permissions, then deny), against PRD section 12; a session has a shell and the whole
     filesystem unless denied; cost is one `total_cost_usd` per session, not tokens per agent
     (acceptance criterion 19); usage limits are shared with the owner's interactive work.
2. **Mastra + Claude API in NestJS providers** (chosen, D3).
   - Pros: tools are typed functions we write, so an allowlist per agent is the default and a
     shell tool simply does not exist; structured outputs validated by zod; one provider
     interface with mock and live adapters; matches the team stack rule (Mastra for agents,
     NestJS for hosts); token usage per call is available to the cost ledger.
   - Cons: a second bill, the exact reason ADR 0002 rejected the API; a key to protect; a
     framework dependency that moves fast (API details below are pinned by version); prompts
     must be maintained as catalog assets instead of reusing Claude Code skills directly; we
     own retries, limits and session logging that the CLI gave for free.
3. **Anthropic SDK directly, no Mastra.**
   - Pros: smallest dependency surface; first access to new API features; full control of the
     tool loop, caching and usage accounting.
   - Cons: we would hand-write the agent loop, tool schema plumbing, structured-output retries
     and workflow suspend/resume; departs from the team standard; no gain for six agents.

## Decision

Option 2. Deciding reasons: (1) per-agent allowlisted typed tools with no shell meet PRD section 12,
which option 1 cannot; (2) runs must continue with no Claude Code session open and report tokens and
USD per agent session; (3) it is the owner's decision D3 and the team stack.

What this fixes:

- **Where agents live.** Each agent is a Mastra `Agent` built in a NestJS provider of the `agents`
  module and reached through an injected interface. The watcher's `execute` (agent stages) and
  recovery steps call that interface (the `brief` step makes no model call; SPEC 0002 K1); controllers never call a model. The watcher boots the
  `agents` module in-process as a standalone Nest application context, so a run never depends on
  `studio start` (owner decision D17, 2026-11-18). **Assumption**: we register no Mastra HTTP routes
  (the `@mastra/nestjs` catch-all controller); if they are ever enabled they are imported last and
  sit behind the D8 guard.
- **Who owns the graph.** The watcher's engine owns phases, stages and the seven fixed steps, as in
  eng-grafo. Mastra agents, and any small Mastra workflow, run only inside a single step. Mastra
  storage and workflow suspend/resume are not used; `run.json` stays the only source of run state
  (owner decision D18, 2026-11-18; ADR 0003).
- **Tools.** Every tool is a `createTool` with zod input and output schemas. Each agent gets an
  explicit allowlist; no tool runs a shell, evaluates code or takes a free path. File tools resolve
  only inside the run folder and the resolved asset paths; `sensitivity: biometric` assets are never
  readable by a tool.
- **Outputs.** Agents answer through `structuredOutput` with a zod schema from `packages/shared`
  (for example recovery's `{ resolved, cause, whatWasDone, needsPerson, whatToDo }`). A valid answer
  is evidence only: the engine's postcondition decides step success (acceptance criterion 11).
- **Models.** Defaults, all **Assumption** and configurable per recipe binding: Planner and Recovery
  `claude-opus-5-5`; Scriptwriter, Scene director and Reviewer `claude-sonnet-5-5`; `claude-fable-5-2` is opt-in only.
  Amended 2026-11-18 (SPEC 0002 K1): the `brief` step renders from a template with no model call
  (topology spec section 2), so `claude-haiku-5-5` has no R1 caller. The model id
  used is written to `manifest.json`.
- **Key handling.** `ANTHROPIC_API_KEY` is read from the environment, else from the macOS Keychain
  entry written by `studio secrets set`. It never appears in files, the database, run files,
  prompts, logs, events, error messages or the launchd plist. Live mode with no key fails at start
  with a named error and never falls back to a literal or silently to mock.
- **Mock by default.** The Claude provider has a mock adapter that returns schema-valid fixtures and
  zero cost; it is the default, so the full graph runs offline (acceptance criterion 3). Live mode
  is an explicit per-provider setting.
- **Cost.** Every agent session records model id, input and output tokens (cache read/write tokens
  when present) and USD into `cost.json`; the run total equals the sum of sessions. USD comes from
  a versioned price table in config (**Assumption**: prices are maintained by hand; the shape of
  Mastra's usage object is to be confirmed in the SPEC). `preflight` blocks at
  `limits.costPerRunUsd = 3` and `limits.costPerMonthUsd = 60` (D11); a session that would cross the
  run ceiling mid-stage stops and the run goes to `waiting`.
- **Retries.** 429, 529 and rate-limit errors are retried with backoff honouring `retry-after`,
  bounded by `limits.attemptsPerStep` and the session timeout (**Assumption**: start from
  eng-grafo's 30 s / 2 min / 10 min ladder). Authentication errors are never retried: `waiting`.
- **Prompt caching.** Stable prefixes (system instructions, skill text, recipe context) are marked
  with `providerOptions.anthropic.cacheControl`; cached tokens are priced separately in `cost.json`.
- **Untrusted content.** Text from references, captured pages and research enters prompts as
  delimited data. It cannot add tools, change allowlists or answer a human gate.
- **Not decided here.** This ADR picks the runtime, not the topology. Which agents exist, who calls
  whom, shared state and handoffs need the approved topology spec (`docs/specs/0001-agent-topology.md`,
  HITL reason `topology-approval`) before any multi-agent workflow code (acceptance criterion 26).
  R2 embeddings come from a local model, never from Claude or any remote API (D10, ADR 0003).

## Consequences

- **Easier:** unattended, resumable runs; least-privilege agents; per-agent cost; offline tests;
  swapping a model per recipe without code changes.
- **Harder:** a real monthly bill; prompts and tool contracts become code and catalog assets we
  version; Mastra upgrades need a pinned version and a mock-run pass before bumping.
- **We commit to maintain:** the tool allowlist per agent, the price table, the mock fixtures in
  step with the zod schemas, session logs under `sessions/` with secrets redacted, and the
  "what left the machine" list per run.
- **Resolved with the owner (D17):** agents are not hosted by `apps/api`. The api only runs under
  `studio start` (D9) while runs must finish without it (acceptance criterion 12), so the watcher
  boots the `agents` module itself. Rejected: launchd keeping the api always on (reverses D9), and
  the watcher starting the api on demand (more moving parts, startup lag per run).
- **Revisit when:** live spend reaches $45 in a calendar month (75% of the D11 ceiling) in two
  consecutive months; mean live cost per approved video exceeds $2; more than 1 in 10 live runs
  enters `waiting` because of rate limits; a Mastra major release changes `structuredOutput`, tool
  or `@mastra/nestjs` contracts, or two upgrades in a row break the mock run; Mastra cannot expose
  cache or usage data needed for acceptance criterion 19 (then option 3 for the Claude adapter
  only); the owner asks for subscription billing instead of API billing (then option 1 behind the
  same provider interface, with an allowlist rather than skip-permissions).
