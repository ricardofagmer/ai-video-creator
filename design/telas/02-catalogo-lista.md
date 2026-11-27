# Tela 02 — Catálogo: lista e busca

| Item | Valor |
| --- | --- |
| Rota | `/catalogo` (aba na URL: `?tipo=`; filtros: `?q=`, `?status=`) |
| Título do documento | `Catálogo · EngineOS Video Creator` |
| Ticket | R1-19 (critérios 5, 7) |

## Objetivo

Ver e encontrar os ativos do catálogo por texto (busca lexical), tipo e status, e começar um
envio novo. Os ativos ficam em abas por tipo e, dentro de cada aba, em seções por categoria.

## Wireframe — desktop (a partir de `lg`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Catálogo                                          [Enviar ativo]         │
│ Templates, modelos, prompts, mídias e kits de marca usados nas receitas. │
│                                                                          │
│  Todos 32 │ Templates 7 │ Modelos de IA 3 │ Referências 0 │ … │ Kits 1   │
│ ══════════                                                               │
│ [Por palavras] [Por significado]                                         │
│ [Buscar no catálogo…                    ] [Status ▾] [Ordenar por ▾] …   │
│ 32 ativos                                                                │
│                                                                          │
│ Templates  7 ativos                                                      │
│ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐           │
│ │ TEMPLATE  (Ativo)│ │ TEMPLATE (Ativo) │ │ TEMPLATE (Ativo) │           │
│ │ Tool Demo        │ │ …                │ │ …                │           │
│ └──────────────────┘ └──────────────────┘ └──────────────────┘           │
│ Modelos de IA  3 ativos                                                  │
│ ┌──────────────────┐ …                                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

Na aba "Templates" (`?tipo=template`) as seções são por proporção:

```
│ Vertical (9:16)  6 ativos                                                │
│ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ …         │
│ Horizontal (16:9)  1 ativo                                               │
│ ┌──────────────────┐                                                     │
```

## Wireframe — mobile (abaixo de `md`)

```
┌──────────────────────────────┐
│ Catálogo                     │
│ Templates, modelos, …        │
│ [Enviar ativo]               │
│ Todos 32 │ Templates 7 │ …   │  as abas quebram em linhas
│ Músicas 4 │ …                │
│ [Buscar no catálogo…       ] │
│ [Status ▾]  [Ordenar por ▾]  │
│ ┌──────────────────────────┐ │
│ │ TEMPLATE        (Ativo)  │ │  um card por linha
│ │ Tool Demo  …             │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

## Estrutura

1. `PageHeader`: título, descrição, ação Button `primary` "Enviar ativo" (link para
   `/catalogo/novo`, com `buttonClassName`).
2. Abas de tipo (`role="tablist"`, rótulo "Tipos de ativo"): "Todos" e uma aba por `AssetKind`, na
   ordem de `assetKinds`, sempre as dez (a posição não muda e uma contagem 0 mostra que o tipo
   está vazio). A aba é o parâmetro `?tipo=` ("Todos" = sem `tipo`); trocar de aba mantém `q`,
   `status`, `ordem`, `nota-min`, `execucoes-min` e `modo` e descarta `cursor`. Cada aba é um link
   com a contagem em `Badge` `neutral`, calculada com os outros filtros (texto, status, nota). A
   contagem só aparece na busca por palavras e some quando a lista filtrada passa de uma página
   (100 versões). A aba selecionada tem o sublinhado `--color-primary`.
3. Painel da aba (`role="tabpanel"`): modos de busca, filtros, contagem e resultados.
4. Barra de filtros (gap `--space-3`, quebra no mobile): `SearchField` (rótulo oculto "Buscar no
   catálogo"), `Select` "Status", "Ordenar por", "Nota mínima" e "Execuções revisadas" com
   rótulos visíveis acima. O tipo não é mais um `Select`: as abas cuidam dele, e o formulário
   leva a aba aberta num campo oculto `tipo`. Os filtros vão para a URL (`searchParams`), não
   para estado global.
5. Contagem "N ativos" em `caption`, `aria-live="polite"` (muda ao filtrar).
6. Seções por categoria. Não há campo de categoria no C1; ela vem do próprio ativo:
   - aba "Todos": uma seção por tipo (título no plural, como na aba), na ordem de `assetKinds`;
   - abas "Templates", "Modelos de IA", "Referências" e "Imagens": uma seção por subtipo, na ordem
     do esquema (`details.aspect` com vertical primeiro, `details.modelType`, `details.subKind`,
     `details.purpose`);
   - abas sem subtipo ("Prompts", "Skills", "Músicas", "Efeitos sonoros", "Kits de marca"): uma
     grade só, sem título de seção.
   Seções sem itens não aparecem. Cada seção tem um `h2` (`heading-2`) e a contagem "N ativos"
   em `caption` ao lado. Dentro da seção fica a ordem da api (recentes ou nota).
7. Grade de `AssetCard` (gap `--space-4`): 1 coluna, 2 a partir de `md`, 3 a partir de `lg`. O
   título de cada card é um link para `/catalogo/[assetId]`. Cada card mostra a versão ativa,
   ou a mais recente quando não há ativa.
8. Na busca por significado as abas filtram por tipo, sem contagem, e o resultado continua uma
   lista única por similaridade (sem seções, para não esconder a ordem).

## Textos da interface

| Lugar | Texto |
| --- | --- |
| Título | Catálogo |
| Descrição | Templates, modelos, prompts, mídias e kits de marca usados nas receitas. |
| Ação | Enviar ativo |
| Busca (rótulo oculto e placeholder) | Buscar no catálogo · Buscar por nome, etiqueta ou nota |
| Abas (rótulo da lista) | Tipos de ativo |
| Aba sem filtro de tipo | Todos |
| Filtro de status | Status · Todos · Rascunho · Ativo · Descontinuado |
| Contagem | 1 ativo · N ativos |
| Vazio (catálogo sem itens) | Título "O catálogo está vazio" · "Envie um arquivo ou rode `studio catalog seed` para importar os ativos do ai-creator-engine." · ação "Enviar ativo" |
| Vazio (aba de um tipo sem itens) | Título "Nenhum ativo deste tipo" · "Envie um ativo deste tipo ou escolha outra aba." · ação "Enviar ativo" |
| Vazio (filtro sem resultado) | Título "Nenhum ativo encontrado" · "Tente outro termo ou limpe os filtros." · ação Button `secondary` "Limpar filtros" |
| Erro | ErrorState "Não foi possível carregar o catálogo" · ação "Tentar de novo" |

### Tipos de ativo (PRD 5.1)

| `AssetKind` | Texto |
| --- | --- |
| `template` | Template |
| `ai-model` | Modelo de IA |
| `reference` | Referência |
| `prompt` | Prompt |
| `skill` | Skill |
| `image` | Imagem |
| `music` | Música |
| `sfx` | Efeito sonoro |
| `brand-kit` | Kit de marca |

### Abas e seções por tipo

| `AssetKind` | Aba e título de seção |
| --- | --- |
| `template` | Templates |
| `ai-model` | Modelos de IA |
| `reference` | Referências |
| `prompt` | Prompts |
| `skill` | Skills |
| `image` | Imagens |
| `music` | Músicas |
| `sfx` | Efeitos sonoros |
| `brand-kit` | Kits de marca |

### Categorias dentro da aba

| Aba | Campo | Valores e textos |
| --- | --- | --- |
| Templates | `details.aspect` | `9:16` Vertical (9:16) · `16:9` Horizontal (16:9) · `1:1` Quadrado (1:1) |
| Modelos de IA | `details.modelType` | `voice-clone` Clones de voz · `avatar` Avatares · `checkpoint` Checkpoints · `lora` LoRAs · `provider-model` Modelos de provedor |
| Referências | `details.subKind` | `video` Vídeos · `image` Imagens · `audio` Áudios · `style` Estilos · `screenshot-set` Conjuntos de capturas de tela · `text` Textos |
| Imagens | `details.purpose` | `logo` Logos · `still` Imagens paradas · `background` Fundos · `cover` Capas · `other` Outras |

## Estados

| Estado | Comportamento |
| --- | --- |
| Carregando | Spinner `md` centralizado na área da grade (padding `--space-10`), com `label` "Carregando o catálogo" |
| Vazio | EmptyState conforme a tabela: sem filtros, "O catálogo está vazio" na aba "Todos" e "Nenhum ativo deste tipo" numa aba de tipo; com filtros, "Nenhum ativo encontrado", e "Limpar filtros" mantém a aba |
| Erro | ErrorState com "Tentar de novo" |
| Sucesso | Grade |

## Acessibilidade

- Abas WAI-ARIA com ativação manual (cada aba carrega uma página): `role="tablist"` com
  `aria-label`, cada aba com `role="tab"`, `aria-selected` e `aria-controls` para o
  `role="tabpanel"`, que tem `aria-labelledby` da aba selecionada. Só a aba selecionada entra na
  ordem de Tab; Seta para a esquerda/direita (circular), Home e End movem o foco; Enter e Espaço
  abrem a aba. Depois de abrir, o foco volta para a aba nova.
- Com seções, o título da seção é `h2` e o título dos cards é `h3`; na grade sem seções os cards
  ficam com `h2`.
- O título de cada card é o único link do card (stretched link); Tab passa de card em card.
- A busca está em `role="search"`; o resultado é anunciado pela contagem `aria-live`.
- Sensibilidade "Biométrico" e "Terceiros" sempre como texto no badge.

## Componentes usados

`PageHeader`, `buttonClassName`, `SearchField`, `FormField`, `Select`, `AssetCard`,
`StatusBadge`, `Badge`, `EmptyState`, `ErrorState`, `Spinner`.
