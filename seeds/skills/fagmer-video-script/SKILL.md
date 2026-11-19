---
name: fagmer-video-script
description: Ricardo Fagmer's viral-script stage for the AI Creator Engine. Writes a truthful, compelling hook, a 165–205 word English narration and a scene-by-scene storyboard on the chosen template's timeline (Tool Demo, AI Battle, Automation Blueprint), citing only verified claims, then writes script.json. No Claude API. Use inside fagmer-video-producer, or when the user asks to "write the TikTok script", "storyboard", or says "fagmer-video-script" or "viral script".
---

# Fagmer Video — Script

**Input:** `research.json`, `claims.json` (validated), `run.json` template.
**Output:** `script.json` matching `ScriptManifestSchema`.
**Hard stop:** a scene states something not backed by a supported claim; misleading or
guaranteed-result promises ("you will make $X").

## Template timelines (seconds, targets; real timing comes from the narration)

- **TOOL_DEMO:** hook 0–3, problem 3–12, steps 12–55, result 55–71, cta 71–80.
- **AI_BATTLE:** hook 0–5, rubric 5–15, evidence 15–58, analysis 58–75, verdict 75–85.
- **AUTOMATION_BLUEPRINT:** hook 0–5, overview 5–18, steps 18–60, result 60–75, cta 75–85.

## Steps

1. Hook: one sentence, under 12 words, a concrete pain or outcome. Truthful; no clickbait the
   video doesn't pay off.
2. Narration: 165–205 words total (aim ~185 for ~80 s), short spoken sentences, second person,
   no jargon without a one-line explanation. Hedge honestly ("can help", "in my test").
3. Scenes (5–12): `kind` from the template, `narration` = the exact words spoken in that scene
   (scene narrations joined with single spaces must equal `narration`), `onScreenText` ≤ 6 words,
   `visual` = what is shown; put the exact product URL in `visual` when the scene is a real
   capture, `claimIds` for every claim the scene states, `durationHintS` from the timeline.
4. CTA: point to the free template/link in profile; never pressure.
5. Show hook, narration and scene list in chat; get approval by click before writing.
6. `wordCount` = number of whitespace-separated words in `narration`.
7. Write `script.json`, then `pnpm ace validate <run> script`.

AI illustrations may support a point but never stand in as proof a product works.

## Production guide

Follow `docs/production-guide.md` sections 1-2. For this stage:

- Story first: a real conflict from the verified claims, each turn resolved by the product
  feature shown in use. A feature tour dressed as a story is not a story.
- Hook as a question in 0-3 s; brand by about 15 s; acts situation, tension, turn, resolution.
- One conducting axis that recurs; named protagonists only when the sources name them.
- `onScreenText`: one idea, at most two lines, readable for 2.5-4 s, one word to highlight.
- The close rhymes with the open; cut or merge any scene that does not move the story.
- Present the scene list as a shot table (time, story, feature shown, caption, sound).
