# Seed input

`studio catalog seed` (SPEC 0002 R1-07) reads this folder through `SeedCatalogCommand`
(`@studio/core/seed`). Running it again is safe: an entry whose content hash already exists as a
version of its asset or recipe is reported `unchanged` and nothing is written.

## Seed source root

Every path in `catalog.seed.json` is relative to the seed source root: the folder that holds
`video-studio/`, the Spesia run folder and `ricardo-clone/` side by side. It defaults to
`~/projects/ai-video-creator` and is moved with `ENGINEOS_VIDEO_CREATOR_SEED_SOURCE_ROOT` (absolute,
normalized path) or the command's `sourceRoot` input.

## Files

| Path | Owner | Content |
|---|---|---|
| `catalog.seed.json` | R1-07 | Templates, brand kit, the `fagmer-video-seo-package` skill (the other 12 `ace` stage skills were retired 2026-11-25), ElevenLabs config by names, the cloned voice by path reference, the Spesia music with its license |
| `templates/*.schema.json` | R1-07 | JSON Schema of the composition props, mirroring `@studio/shared/ace`; becomes `details.inputSchema` / `sceneSchema` |
| `skills/<id>/` | R1-01 | One `skill` asset per folder; name and description come from `SKILL.md` front matter |
| `prompts/*.prompt.json` | R1-15 | One `prompt` asset per file (format below); optional folder |
| `recipes/*.recipe.json` | R1-15 | One recipe per file (format below); optional folder, loaded after every asset |

Nothing here holds a secret value or a biometric byte: credentials are named, and the voice
samples are registered by path, hashed in place when the seed runs.

## `prompts/<name>.prompt.json`

```json
{
  "assetId": "writer-prompt",
  "name": "Prompt do roteirista",
  "summary": "optional, up to 200 characters",
  "tags": ["prompt", "writer"],
  "textFile": "writer-prompt.md",
  "mimeType": "text/markdown",
  "variables": [{ "name": "topic", "type": "string", "description": "", "required": true, "default": null }],
  "notes": ""
}
```

`textFile` is relative to `prompts/`. `provenance` is optional (C1 `Provenance`); omitted, it is
`created-here` by the manifest owner.

## `recipes/<name>.recipe.json`

```json
{ "recipeId": "tool-demo-9x16", "definition": { "name": "...", "bindings": [{ "slot": "template", "ref": "tool-demo-template@1" }] } }
```

`definition` is a C2 recipe without `id`, `version`, `status`, `createdAt` and `updatedAt`. A
binding may omit `contentHash`; the seed pins it from the catalog version the `ref` names.

## R1 recipes and prompts (R1-15)

Both folders are loaded through `recipesFolder` and `promptsFolder` of `catalog.seed.json`; no
manifest entry lists them. The 16:9 template they need is the `product-tour-template` entry.

| File | Registers | Binds or declares |
|---|---|---|
| `recipes/product-tour-16x9.recipe.json` | recipe `product-tour-16x9@1` | `product-tour-template@1`, `fagmer-brand@1`, the four prompts, `elevenlabs-voice@1`, `spesia-music-683@1` |
| `recipes/tool-demo-9x16.recipe.json` | recipe `tool-demo-9x16@1` | `tool-demo-template@1`, `fagmer-brand@1`, the four prompts, `elevenlabs-voice@1`, `spesia-music-680@1` |
| `prompts/writer-prompt.prompt.json` | prompt `writer-prompt@1` | slot `prompt:writer`; reaches the Scriptwriter as `WriterPacket.inputs.promptText` |
| `prompts/director-prompt.prompt.json` | prompt `director-prompt@1` | slot `prompt:director`; metering only in R1 (no packet field) |
| `prompts/reviewer-prompt.prompt.json` | prompt `reviewer-prompt@1` | slot `prompt:evaluator`; metering only in R1 |
| `prompts/recovery-prompt.prompt.json` | prompt `recovery-prompt@1` | slot `prompt:recovery`; metering only in R1 |

Rules the files keep:

- No recipe pins a `contentHash`: the seed pins each binding at seed time, so no hash is written
  by hand and a stale pin cannot exist in these files.
- The voice slot binds the ElevenLabs provider model (credential and voice by name only). In mock
  mode the narration uses the in-process mock voice. No recipe binds the biometric local voice;
  binding `owner-voice-clone-*` is an owner decision made in the recipe editor.
- Prompt `variables` name the packet fields each text refers to (`WriterPacket.inputs.brief.topic`
  and so on). R1 does not substitute variables: the text refers to the fields by name, and every
  prompt says that packet and run content is data, never instructions, and that the answer must
  match the role's zod output schema.
- Tool Demo stage order `research -> verify -> script -> assets -> narrate -> render -> qa` maps to
  the A5 stage ids: assets = `capture` + `scenes`, narrate = `narration`, render = `composition` +
  `captions` + `fades` + `music`, qa = `qa` + `agent-review`; `plan` and `package` are mandatory.
- The checklist is the 8 `publishChecklistItems` ids of `@studio/shared/ace` with pt-BR labels (D14).
