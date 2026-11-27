---
name: 2026-11-23-help-diagram-legend-i18n
status: done
completed: 2026-11-23
owner: Ricardo Fagmer
spec: n/a — follow-up asset swap to the archived 2026-11-23-navbar-help-modal (4 static SVGs, no code change)
domain: frontend
security_review: not-required
risk: low
new_feature: false
release: false
---

## What
Translate the legend of the help-modal usage diagram in pt-BR and es: the title and its 7 entry labels.

## Why
The developer answered "Yes, translate it" to the open follow-up left by `2026-11-23-navbar-help-modal`, whose pt-BR and es diagrams still had an English legend.

## Scope
- `apps/web/public/ajuda/como-usar-pt-BR-{light,dark}.svg` and `como-usar-es-{light,dark}.svg` (replaced)
- `.archify/workflow-video-studio-usage-ptbr-20261123/candidate.json` and `.archify/workflow-video-studio-usage-es-20261123/candidate.json` in the parent folder (diagram sources, outside this repo)

## Checklist
- [x] Set `meta.legend.entries.*.label` in both Archify candidates and finalize them
- [x] Re-export light and dark SVGs for pt-BR and es
- [x] Translate the legend title, which Archify cannot localize for these languages
- [x] Verify visibly in the running app

## What was made
- Translated the 7 legend entries through the Archify schema: pt-BR "Interface do usuário, Lógica do agente, Política, Ação de ferramenta, Contexto / registro, Serviço em nuvem, Sistema externo"; es "Interfaz de usuario, Lógica del agente, Política, Acción de herramienta, Contexto / registro, Servicio en la nube, Sistema externo".
- Re-exported the four SVGs. Archify 3.0.1 only localizes `en` and `zh-CN`, so the single "Legend" title text node was replaced afterwards with "Legenda" (pt-BR) and "Leyenda" (es).
- The viewBox widths are unchanged (pt-BR 1158, es 1148), so `HelpButton.tsx` needed no edit.

## Not done
- nothing

## User checklist
- [ ] Run the final checks skipped earlier when convenient: `pnpm --filter @studio/ui typecheck`, `pnpm --filter @studio/ui lint`, `pnpm --filter web build`
- [ ] Commit the help-modal work together with these SVGs (nothing committed; git writes need your approval)
- [ ] If the diagram is regenerated later, the "Legend" title must be replaced again after export (Archify limitation)

## Verification
- ran: `node bin/archify.mjs finalize workflow .archify/workflow-video-studio-usage-ptbr-20261123/candidate.json .archify/workflow-video-studio-usage-ptbr-20261123/video-studio-usage-pt-br.html --quality showcase --out-dir legend-3 --json` exit 0 (2026-11-23)
- ran: `node bin/archify.mjs finalize workflow .archify/workflow-video-studio-usage-es-20261123/candidate.json .archify/workflow-video-studio-usage-es-20261123/video-studio-usage-es.html --quality showcase --out-dir legend-3 --json` exit 0 (2026-11-23)
- Both receipts: validate, deliver, check and browser-check passed.
- Static scan of the four new SVGs: no "Legend", "User UI", "Agent logic" or "External system" left; no `<script>` and no external `href`.
- Manual, in the built-in browser on the `studio-web-dev` preview (port 4320): pt-BR dark modal showed "Legenda" with the Portuguese entries; es light modal showed "Leyenda" with the Spanish entries. Both images loaded at their natural widths (1158, 1148). Language and theme were restored to Português and system afterwards.

## Human decisions
- 2026-11-23 | Ricardo Fagmer | follow-up choice (not a hitl reason) | approved | "Yes, translate it"
- No hitl.required reason fired (risk low, autonomy A2).

## Changes registered
- Four untracked SVGs replaced in place; the whole `apps/web/public/ajuda/` folder is still untracked from the help-modal change.

```
$ git status --short apps/web/public/ajuda
?? apps/web/public/ajuda/
```

## Notes
- Follow-up to `.engineos/archived/2026/11/frontend/2026-11-23-navbar-help-modal.md`, whose "Not done" listed the English legend.
- Archify 3.3.0 is available (installed 3.0.1); not installed. It may add legend-title localization, which would remove the post-export text replacement.
