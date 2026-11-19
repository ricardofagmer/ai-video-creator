---
name: fagmer-video-trend-research
description: Ricardo Fagmer's video trend-research stage for the AI Creator Engine. Finds and ranks timely, relevant AI tool and automation topics with real sources using Claude Code web search (no Claude API), then writes research.json for a run. Use inside fagmer-video-producer, or when the user asks "what should today's TikTok be about", "find AI tool topics", or says "fagmer-video-trend-research".
---

# Fagmer Video — Trend Research

**Input:** a run folder (`runs/<runId>/`, state RESEARCH) with `topicSeed`, `pillar`, `template` in `run.json`.
**Output:** `research.json` matching `ResearchManifestSchema` (`packages/contracts/src/manifests.ts`).
**Hard stop:** fewer than 2 credible sources, or no primary source (official docs, vendor page,
changelog, or a test you reproduced). Never invent a trend, a launch or a number.

## Steps

1. If the seed is "find a topic for me": run 3–5 WebSearch queries for the pillar (for example
   "<tool category> new feature this week", "<tool> changelog", "automation workflow <app> <app>").
   Rank 3 candidates by novelty (not covered to death), usefulness to creators/developers/founders,
   and whether you can show it working on screen. Present them by click with one-line angles and
   their sources; the user picks one.
2. For the chosen topic, open each source with WebFetch. Keep 3–8 sources. Mark `primary: true`
   only for vendor docs/pages/changelogs or a reproducible test, `false` for news and blogs.
3. `excerpt`: the passage that supports the topic, copied short (under 400 characters), not a summary.
4. `angle`: one sentence on what the viewer will see work and why it saves them time.
5. Write `research.json` with `schemaVersion: 1`, `retrievedAt` as ISO time now.
6. `pnpm ace validate <run> research` and read its final JSON line.

Avoid recycled AI-news headlines. Prefer workflows with a visible outcome you can capture.
