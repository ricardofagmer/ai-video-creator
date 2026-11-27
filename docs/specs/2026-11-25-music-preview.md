# Music preview in the preset form

Date: 2026-11-25. Owner request: "as voices music should also be played possible".

## Problem
The preset form lets the owner hear the chosen voice ("Listen" beside the Voice select) but not the chosen music. Music is picked by name only.

## Solution
A "Listen" button beside the Music select plays the stored audio of the selected music version.

- Api: `GET /catalog/assets/:assetId/versions/:version/audio`, behind the session guard like every catalog route. Serves the stored bytes of a `music` version with `Range` support so the browser can seek. Any refusal is 404.
- Core: `GetAudioContentQuery` answers the blob path, MIME type and size. Served only when the version is kind `music`, layout `file`, storage `store`, not biometric, and its MIME type is one of the catalog's audio types.
- Web: route `catalog.audio` in the BFF allow-list; `MusicPreviewButton` uses the same `Button` (secondary, sm, `play-circle` icon), the same wrapper styles and the same one-at-a-time playback as `VoiceSampleButton`. Press plays, press again pauses. No button when "No binding" is selected.
- Labels in pt-BR, es and en under `catalog.musicPreview`.

## Rejected alternative
Reusing the voice sample route: it generates a spoken clip through an asset job and is tied to `ai-model` voices. Music already has its bytes in the store, so a job would add cost and delay for nothing.

## Out of scope
Music by reference path (never read for the web), sound effects, a player with a seek bar, the catalog page.

## Acceptance
1. `/receitas/carrinho-completo-9x16`: the Music row shows "Listen" styled like the Voice one when a track is selected.
2. Pressing it plays the selected track; pressing again pauses; starting a voice sample pauses the music and the reverse.
3. "No binding" shows no button.
4. Without a session the audio route answers 401; a non-music version answers 404.
