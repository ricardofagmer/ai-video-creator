# Images, saved prompts and run instructions — design

Date: 2026-11-23 · Owner: Ricardo Fagmer · Status: accepted (built without preview, by the owner's choice)

## Problem

The owner wants to keep their own images in the catalog (from a file or from a link), put them
in the cart for a video, tell the AI in their own words how to make one video, and keep those
instructions in the catalog to reuse them. Images and prompts exist as kinds, but they are buried
inside the "Mídia e marca" and "IA e escrita" sections, an image can only be a file, and a run has
no field for free instructions.

## Owner decisions (clickable questions, 2026-11-23)

- Images and prompts get their own catalog sections.
- An image saved from a link keeps the link only, with a thumbnail preview.
- Run instructions: a free-text box at checkout and on the new run, fillable from a saved prompt.
- Build directly, no preview.

## Chosen approach

1. **Sections.** `/catalogo` gets two more sections: *Imagens* (`image`, slug `imagens`) and
   *Prompts* (`prompt`, slug `prompts`). *IA e escrita* keeps AI models and skills; *Mídia e marca*
   keeps music, sound effects and brand kits.
2. **Images section.** A link box: the owner pastes an `https://` image URL, the browser shows it
   as a thumbnail and reads its width and height; the owner names it and saves. The item is a
   `draft` `image` version, `sensitivity: third-party`, provenance `{type: url}`, whose only file is
   a `text/plain` file holding the URL (the image kind now also accepts `text/plain`). A file upload
   button opens the existing New item form with the image kind. Image cards with a link show the
   thumbnail. The page CSP gains `img-src https:` so thumbnails load straight from the owner's link
   (no server fetch, so no server-side request to arbitrary hosts).
3. **Prompts section.** A "New prompt" form with name and text (up to 20,000 characters) saves a
   `draft` `prompt` version as a `text/markdown` file with no variables.
   The entry-file read route now also serves the text of a stored file `prompt` version, so the
   web can load a saved prompt.
4. **Run instructions.** `Brief.instructions?: string` (1..2,000 characters, optional, so older
   run.json files still parse). The cart's checkout view and the New run form have an
   "Instruções para a IA" box; a picker fills it from a saved prompt. The checkout text is kept in
   browser storage with the cart and fills the New run box when the run comes from the cart.
5. **Agents.** The planner and the writer already receive the whole brief; their prompts gain one
   line that treats `inputs.brief.instructions` as the owner's direction that never changes task,
   tools, output contract or constraints (`planner@2`, `writer@4`). The director gets the same text
   as a delimited `ownerInstructions` input (`director@3`).

## Rejected alternative

*Download a copy of a linked image on the server.* It makes the image drawable by the renderer and
survives a dead link, but the owner chose link-only. Consequence, stated to the owner: a link image
travels to the run as a reference the agents can see, but the renderer only draws `image/*` files,
so it is not drawn on screen until a copy is uploaded.

## Acceptance criteria

- AC1: `/catalogo` shows *Imagens* and *Prompts* tabs; each lists only its kind.
- AC2: pasting an https image link shows a thumbnail; saving creates a draft image item whose card
  shows the thumbnail and that can be added to the cart (it becomes a run reference).
- AC3: the Images section offers a file upload that opens the New item form set to Image.
- AC4: the Prompts section saves a named prompt text as a draft prompt item.
- AC5: the checkout and the New run form have an instructions box (max 2,000) with a saved-prompt
  picker; the created run's brief carries `instructions`.
- AC6: the writer and planner prompts and the director packet carry the instructions as described.
- AC7: pt-BR, en and es texts for every new label.

## Verification

Typecheck, lint, tests and the browser walkthrough run only at the final gate after the owner's
approval (`rules/verification.md`). The CSP change and the new prompt-text read are queued for the
final security review.
