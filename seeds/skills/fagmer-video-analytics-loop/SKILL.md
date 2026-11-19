---
name: fagmer-video-analytics-loop
description: Ricardo Fagmer's analytics-loop stage for the AI Creator Engine. Reviews published videos' TikTok Studio metrics (views, average watch time, completion, saves, shares, profile visits, link clicks) by run, marks immature cohorts, compares pillars, hooks and templates, and recommends the next topics. Use when the user asks "how are the videos doing", "what should we post next", "analyze TikTok results", or says "fagmer-video-analytics-loop".
---

# Fagmer Video — Analytics Loop (R3 preview)

**Input:** approved runs in `runs/` plus metrics the user reads from TikTok Studio.
**Output:** a dated analysis in `docs/analytics/<date>.md` and up to 5 topic recommendations.
**Hard stop:** missing or immature data. Videos younger than 72 h are "immature" and never
ranked; never present a guess as a result or promise revenue.

## Steps

1. `pnpm ace list` to see approved runs (topic, pillar, template, cost).
2. Ask the user for each video's metrics (or a CSV export from TikTok Studio); no scraping, no
   logins on the user's behalf.
3. Compare like with like: same pillar or template, similar duration; change one creative
   variable at a time. Report completion rate, average watch time, saves and shares per run,
   the top quartile, and cost per video.
4. Recommend next topics with the pattern behind each (pillar, hook style, template), labelled
   as hypotheses to test, and offer to start `fagmer-video-producer` with one.
