# Catalog sections and link embed — design

Date: 2026-11-23 · Domain: frontend, security (CSP) · Risk: medium (Content-Security-Policy change)

## Problem

The owner finds `/catalogo` confusing: "not only template, all the item, it is poorly organized".
It shows nine kind tabs in one row (Templates, AI models, References, Prompts, Skills, Images,
Music, Sound effects, Brand kits), several of them empty. The catalog's main job is to keep video
references: the owner pastes a link such as `https://www.instagram.com/p/DfDrN7Xgi3G/` and keeps it
for future projects. The owner also asked to "leave this video displaying in this page to check the
outcome (do not download just a embbed)".

## Decisions (owner, 2026-11-23)

- Layout: References first, with a link box at the top, then plain sections.
- Fetching other people's videos: link plus upload fallback, never a downloader. Only the embed is
  in this scope.
- Script contents (later): a beat-by-beat breakdown plus a draft script for the owner's version.
- Scope now: catalog only. Analysis, script generation and saving a link are a later spec.

## Chosen approach

### Sections

Four sections replace the nine-tab row. Each one groups kinds by what the owner does with them:

| Section (URL `?secao=`) | Kinds | Label (en) |
|---|---|---|
| `referencias` (default) | reference | References |
| `modelos` | template | Video templates |
| `ia-e-escrita` | ai-model, prompt, skill | AI & writing |
| `midia-e-marca` | image, music, sfx, brand-kit | Media & brand |

- The top tablist shows the four sections, each with its count. A section is never hidden, even
  when it is empty.
- Inside a section that has more than one kind, a second tablist shows "All" plus each kind that has
  at least one asset. Empty kinds are hidden. `?tipo=` picks the kind, as it does today.
- Video templates keeps its category tabs (Hooks, Title cards, and so on).
- `?tipo=` without `?secao=` implies that kind's section, so old links keep working.
- The filters, the "By words" / "By meaning" switch and paging stay as they are, inside the section
  panel. A search runs over the section's kinds.

### Link box and embed

- The References section opens with a form (`GET /catalogo`, fields `secao=referencias` and
  `link`): "Paste a video link" plus an "Show" button.
- The server parses `?link=` as untrusted input. It accepts only
  `https://(www.)instagram.com/{p|reel|tv}/{shortcode}/` (shortcode `[A-Za-z0-9_-]{5,40}`, with an
  optional query string or trailing slash) and keeps only `{type, shortcode}`. Anything else shows
  "Only Instagram post and reel links are supported for now."
- The page renders Instagram's official embed:
  `<iframe src="https://www.instagram.com/{type}/{shortcode}/embed/">`. The pasted string never
  reaches the DOM; only the parsed shortcode does. The iframe has a title, a fixed 9:16 frame,
  `loading="lazy"`, `referrerPolicy="strict-origin-when-cross-origin"` and
  `sandbox="allow-scripts allow-same-origin allow-popups"`.
- Nothing is downloaded or stored. The embed stays while `?link=` is in the URL, and "Clear"
  removes it.

### Content-Security-Policy

`src/middleware.ts` adds a single directive, `frame-src https://www.instagram.com`. Nothing else is
loosened: no instagram script in `script-src` (the iframe runs Instagram's script in its own
origin), and `frame-ancestors 'none'` and `X-Frame-Options: DENY` still stop the studio itself from
being framed.

## Rejected alternatives

- Instagram's `embed.js` blockquote: it needs `https://www.instagram.com` in `script-src`, which
  runs a third-party script inside the studio origin. The iframe keeps it isolated.
- A sidebar of sections: more layout work and a second navigation pattern, while the catalog
  already uses URL tabs.
- Downloading with yt-dlp: against Instagram's terms, and the owner chose not to download.

## Tickets

1. **Sections model:** `catalog-sections.ts` (the section list, section of a kind, URL parsing) and
   `catalog-query.ts` (`?secao=`, a kind implies its section, hrefs). Contract: `CatalogFilters`
   gains `section`.
2. **Sections layout:** `catalogo/page.tsx`, the section tabs plus per-section kind sub-tabs with
   empty kinds hidden, and the pt-BR/en/es messages. Depends on 1.
3. **Link box and embed:** `instagram-link.ts` (parser), `CatalogLinkBox` and `InstagramEmbed`
   components, the CSP `frame-src`, and messages. Depends on 1.

The supervisor does all three: they are small and share `page.tsx`.

## Validation

- Browser: the four sections with counts; empty kinds hidden; old `?tipo=` links land on the right
  section; pasting `https://www.instagram.com/p/DfDrN7Xgi3G/` shows the embed; an invalid link shows
  the message; the console shows no CSP violations.
- Final gate (with consent): web typecheck and lint, then a security review of the CSP change.

## Out of scope

Downloading, analysis, script generation, saving a link as a reference asset, and TikTok and
YouTube links.
