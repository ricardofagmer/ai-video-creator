# Referência de design do EngineOS Video Creator

Esta pasta é a **referência visual única** do EngineOS Video Creator (PRD 0001, seção 4: "`design/` as
visual source of truth"). Ela define o design system (tokens e componentes) e especifica cada
tela da web. O código de `packages/ui` (`@studio/ui`) e de `apps/web` segue esta referência
**à risca**: cores, espaçamentos, textos da interface, estados e comportamento responsivo saem
daqui, e nada é inventado na implementação.

## Regra de fidelidade

Herdada do eng-grafo (`design/README.md` de lá) e aplicada aos dois consumidores:

1. `packages/ui` transcreve `tokens.md` para `src/styles/tokens.css` com o **nome exato** de
   cada CSS variable, e implementa os componentes de `componentes.md` e
   `componentes-estudio.md` com as variantes, estados e textos escritos aqui.
2. `apps/web` monta as telas de `telas/*.md` só com componentes de `@studio/ui` e tokens.
   Um texto da interface é copiado da tabela "Textos da interface" da tela, palavra por palavra.
3. Uma necessidade que esta pasta não cobre volta para cá primeiro (nova linha de token, novo
   componente ou novo texto) e só depois vira código. A implementação nunca "completa" o design.
4. Divergência entre código e referência é defeito do código, salvo quando a referência está
   errada; nesse caso a referência é corrigida no mesmo ticket que corrige o código.

## Origem desta referência

**Definida sem handoff.** Quando esta referência foi escrita (2026-11-18, ticket R1-18) não
existia bundle do Claude Design em `design/handoff/`, e o dono recusou o protótipo de
pré-visualização. Os arquivos abaixo definem um design system neutro, adaptado da referência do
eng-grafo (escala cinza-ardósia, tipografia do sistema, escala de 4 px) com primária violeta e
tema escuro.

## Precedência do handoff

1. Se existir `design/handoff/` (bundle exportado pelo Claude Design), ele é a **fonte da
   verdade** visual e manda sobre qualquer arquivo desta pasta.
2. Um bundle colocado depois em `design/handoff/` também manda: as divergências são resolvidas a
   favor do handoff, e os arquivos desta pasta são atualizados para refletir o bundle.
3. Sem handoff, valem os arquivos desta pasta.

## Regras de uso

- Os componentes usam só os **tokens semânticos** (`--color-bg`, `--color-surface`,
  `--color-text`, …); a escala bruta (`--color-gray-*`, `--color-primary-*`) serve só para
  definir os semânticos.
- **Nenhuma cor literal fora de `tokens.md` e de `packages/ui/src/styles/tokens.css`.** Telas e
  componentes citam tokens pelo nome da CSS variable.
- Todo token citado em `componentes*.md` e em `telas/*.md` existe em `tokens.md`.
- Tema claro e escuro: cada token semântico tem os dois valores. O tema segue o sistema
  operacional; `data-theme="light"` ou `data-theme="dark"` em `<html>` força um deles.
- Textos da interface em português do Brasil, exatamente como escritos nas telas (D16), que é o
  idioma-fonte; a interface também existe em espanhol e inglês, seguindo `glossario.md`. Código,
  identificadores e comentários em inglês.
- Sem fontes externas e sem arquivos de imagem ou ícone: marcadores e indicadores são desenhados
  com CSS e tokens; o significado está sempre no texto, nunca só na cor.

## Índice

| Arquivo | Conteúdo |
| --- | --- |
| `README.md` | Este arquivo: regra de fidelidade, origem e precedência do handoff |
| `tokens.md` | Cores (claro e escuro), tipografia, espaçamento, raios, sombras, foco, layout, z-index, movimento e contraste |
| `componentes.md` | Componentes base: Button, Spinner, link de texto, campos de formulário (FormField, Input, Textarea, Select, Checkbox, RadioGroup, SearchField), Card, Badge, Alert, Table, DescriptionList, Dialog, estados vazio e de erro, AppShell, PageHeader, Logo |
| `glossario.md` | Termos da interface em pt-BR, es e en, e as regras de tradução |
| `componentes-estudio.md` | Componentes do estúdio: StatusBadge, AssetCard, VersionList, UploadDropzone, BindingList, StepTimeline, NowPanel, EventLog, RunControls, CostMeter, WatcherIndicator, WaitingNotice, VideoPlayer, RatingInput, Checklist, QaResultList |
| `telas/01-layout-e-login.md` | Layout privado e `/login` (R1-19) |
| `telas/02-catalogo-lista.md` | `/catalogo` — lista e busca (R1-19) |
| `telas/03-catalogo-ativo.md` | `/catalogo/[assetId]` — detalhe com versões (R1-19) |
| `telas/04-catalogo-envio.md` | `/catalogo/novo` — envio e registro por referência (R1-19) |
| `telas/05-receitas-lista.md` | `/receitas` — lista (R1-19) |
| `telas/06-receita-editor.md` | `/receitas/nova` e `/receitas/[recipeId]` — editor com vínculos (R1-19) |
| `telas/07-execucoes-lista-e-nova.md` | `/execucoes`, `/execucoes/nova` e aprovação do plano (R1-20) |
| `telas/08-execucao-linha-do-tempo.md` | `/execucoes/[runId]` — linha do tempo ao vivo (R1-20) |
| `telas/09-revisao.md` | `/execucoes/[runId]/revisao` — revisão humana (R1-20) |

## Do design ao pacote

| Referência | Implementação |
| --- | --- |
| `tokens.md` | `packages/ui/src/styles/tokens.css` (único arquivo com cores literais) |
| `tokens.md`, seção 2.5 | `packages/ui/src/styles/utilities.css` (classes `heading-1`, `caption`, …) |
| `componentes.md`, `componentes-estudio.md` | `packages/ui/src/components/<pasta>/<Componente>.tsx` + `.module.css` |
| `telas/*.md` | `apps/web/app/**` (R1-19, R1-20) |

A web importa `@studio/ui/styles.css` uma vez no layout raiz e declara `@studio/ui` em
`transpilePackages` do `next.config` (o pacote exporta código-fonte TypeScript e CSS Modules).
