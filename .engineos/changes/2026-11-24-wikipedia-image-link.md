---
name: 2026-11-24-wikipedia-image-link
status: active
owner: Claude (supervisor) for the owner
spec: n/a — fast change chosen by the owner; web-only bug fix, low risk, decisions recorded under Human decisions
domain: frontend
security_review: not-required
risk: low
new_feature: false
release: false
---

## What
The Catálogo's "Salvar uma imagem" box now shows the picture when the pasted link is a Wikipedia or
Wikimedia Commons image page, says more when a link is a page and not an image, and no longer leaves
the broken thumbnail box on screen.

## Why
The owner reported (2026-11-24, with a screenshot): "is not displaying img". The pasted link was
`https://pt.wikipedia.org/wiki/Lego#/media/Ficheiro:LEGO_logo.svg` and the box answered "Não foi
possível carregar uma imagem neste link." beside an empty box reading "Miniatura da imagem do link".

Root cause, with evidence (2026-11-24): the box puts any `https:` link into an `<img>`. That link is
the article page: the part after `#` never reaches the server, and `curl -sIL
https://pt.wikipedia.org/wiki/Lego` answers `content-type: text/html`. The same wiki's
`/wiki/Special:FilePath/LEGO_logo.svg` redirects (301, 302, 301) to
`upload.wikimedia.org/wikipedia/commons/2/24/LEGO_logo.svg`, `content-type: image/svg+xml`. Second
defect: `.imagePreview img { display: block }` won over the `hidden` attribute, so the broken image
and its alt text stayed visible.

## Scope
`apps/web/src/features/catalog` (new link rule, the image box, its CSS) and the catalog texts in
pt-BR, en and es. No api, no database; the server still fetches nothing.

## Checklist
- [x] Cause found and confirmed before any change
- [x] Owner chose the behaviour and the planning (see Human decisions)
- [x] Wikipedia and Commons image-page links are rewritten to the file's address in the browser
- [x] Broken thumbnail hidden; clearer message for a page link; texts in three languages
- [x] Seen working on a stand-in page (see Verification)
- [x] Seen on the real Catálogo → Imagens page (see Verification)

## What was made
- `wikimedia-image-link.ts`: `wikimediaFileUrlOf(url)`. For a host `*.wikipedia.org` (mobile too) or
  `commons.wikimedia.org`, a media-viewer link (`#/media/<Namespace>:<name>`) or a file page
  (`/wiki/<Namespace>:<name>`) whose name ends in an image extension becomes
  `https://<same host>/wiki/Special:FilePath/<name>`. Any other link returns null and is used as typed.
- `ImageLinkBox`: the preview and the saved link use the rewritten address; the caption under the
  thumbnail says the Wikipedia page link was replaced by the address of the image file.
- `catalog.module.css`: `.imagePreview img[hidden] { display: none; }`.
- Texts (pt-BR, en, es): the failure message now tells how to copy the image's own address; new
  caption text `fromWikimediaPage`.

## Not done
- No typecheck, lint or test run (owner: "Skip for now"). No test written for `wikimediaFileUrlOf`;
  the web package has `node:test` files but no test script to run them.
- Only Wikipedia and Wikimedia Commons pages are understood. Any other page link (a Google Images
  result, a Pinterest pin, an Instagram post) still fails, now with the clearer message.
- The saved address is the `Special:FilePath` one, which redirects to the file on every load.
- An SVG reports its own drawing size (the LEGO logo: 150 × 150 px), which is what gets saved.

## User checklist
- [x] Dev api running and signed in at 127.0.0.1:4320 (owner, 2026-11-24: "Done, check")
- [ ] Approve typecheck and lint for `@studio/web` and `@studio/ui` (4 commands, under Verification)

## Human decisions
| Date | Who | Reason ids | Decision | Note |
|---|---|---|---|---|
| 2026-11-24 | Ricardo Fagmer | none | approved | Behaviour: "Understand Wikipedia links (Recommended)". |
| 2026-11-24 | Ricardo Fagmer | none | approved | Planning: "Fast change (supervisor) (Recommended)". |
| 2026-11-24 | Ricardo Fagmer | none | refused | Final checks (typecheck and lint, web and ui): "Skip for now". |
| 2026-11-24 | Ricardo Fagmer | none | approved | Artifact: "Proceed without artifact (Recommended)". |

No HITL reason fired: risk low, no external effect.

## Verification
[validation] pending — final-stage user approval required

- Checkpoint: `kernel checkpoint --files <11 files> --risk low` answered `checks: ask`,
  `security: skip`, `offers: ask`. Proposed and not run: `corepack pnpm --filter @studio/web run
  typecheck`, `... run lint`, `corepack pnpm --filter @studio/ui run typecheck`, `... run lint`.
- Tests: not offered; the web package has no test script. Unavailable evidence, not a pass.
- Stand-in check, looked at, not a check run (built-in browser, 127.0.0.1:4320, 2026-11-24): a
  temporary page `app/zz-check/page.tsx` rendered the real `ImageLinkBox`. The owner's link showed
  the LEGO logo, with the caption "150 × 150 px · Wikipedia page link replaced by the address of
  the image file", the image `src` being `https://pt.wikipedia.org/wiki/Special:FilePath/LEGO_logo.svg`,
  and the Name, Use and Owner fields with "Save image". The plain article link
  `https://pt.wikipedia.org/wiki/Lego` showed only the new warning; the image's computed `display`
  was `none`. Nothing was saved. The temporary page was deleted afterwards.

- Real-page check, not possible (2026-11-24): after the installed app restarted its api, the dev
  server logged `POST /api/studio/auth/login 403`. The api allows writes only from its configured
  web origin (`apps/api/src/platform/api-config.ts`: default `http://127.0.0.1:4310`), so a sign-in
  from `127.0.0.1:4320` is refused, and the page at 4310 is the packaged build without this change.
  Owner: "Leave it for now (Recommended)". Unavailable evidence, not a pass.

- Real page, looked at, not a check run (owner's Chrome, http://127.0.0.1:4320/catalogo?secao=imagens,
  pt-BR, 2026-11-24, after the owner said "Done, check"): the owner's link
  `https://pt.wikipedia.org/wiki/Lego#/media/Ficheiro:LEGO_logo.svg` and "Mostrar" showed the LEGO
  logo; image `src` `https://pt.wikipedia.org/wiki/Special:FilePath/LEGO_logo.svg`, natural size
  150 × 150, caption "150 × 150 px · link de página da Wikipédia trocado pelo endereço do arquivo da
  imagem", with the Nome, Categoria, Uso and Responsável fields and "Salvar imagem". Nothing was
  saved; the box was cleared with "Limpar". The plain article link (warning only, no broken box) was
  seen on the stand-in page only.

## Changes registered
Not a git repository; files listed by hand.

New:
- apps/web/src/features/catalog/wikimedia-image-link.ts

Changed:
- apps/web/src/features/catalog/components/ImageLinkBox.tsx
- apps/web/src/features/catalog/catalog.module.css
- apps/web/src/messages/catalog/pt-BR.ts, en.ts, es.ts
