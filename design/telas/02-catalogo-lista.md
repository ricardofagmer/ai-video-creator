# Tela 02 — Catálogo: lista e busca

| Item | Valor |
| --- | --- |
| Rota | `/catalogo` (filtros na URL: `?q=`, `?tipo=`, `?status=`) |
| Título do documento | `Catálogo · Video Studio` |
| Ticket | R1-19 (critérios 5, 7) |

## Objetivo

Ver e encontrar os ativos do catálogo por texto (busca lexical), tipo e status, e começar um
envio novo.

## Wireframe — desktop (a partir de `lg`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Catálogo                                          [Enviar ativo]         │
│ Templates, modelos, prompts, mídias e kits de marca usados nas receitas. │
│                                                                          │
│ [Buscar no catálogo…                    ] [Tipo: Todos ▾] [Status ▾]     │
│ 24 ativos                                                                │
│                                                                          │
│ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐           │
│ │ TEMPLATE  (Ativo)│ │ MÚSICA (Ativo)   │ │ MODELO DE IA     │           │
│ │ Tool Demo        │ │ Mixkit Tech Hou… │ │ (Rascunho)(Biom.)│           │
│ │ tool-demo@1      │ │ mixkit-tech@1    │ │ Voz Ricardo      │           │
│ │ [9:16] [hook]    │ │ [trilha]         │ │ voz-ricardo@1    │           │
│ │ Usado em 3 exec… │ │ Usado em 1 exec… │ │ Usado em 0 exec… │           │
│ └──────────────────┘ └──────────────────┘ └──────────────────┘           │
└──────────────────────────────────────────────────────────────────────────┘
```

## Wireframe — mobile (abaixo de `md`)

```
┌──────────────────────────────┐
│ Catálogo                     │
│ Templates, modelos, …        │
│ [Enviar ativo]               │
│ [Buscar no catálogo…       ] │
│ [Tipo ▾]      [Status ▾]     │
│ ┌──────────────────────────┐ │
│ │ TEMPLATE        (Ativo)  │ │  um card por linha
│ │ Tool Demo  …             │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

## Estrutura

1. `PageHeader`: título, descrição, ação Button `primary` "Enviar ativo" (link para
   `/catalogo/novo`, com `buttonClassName`).
2. Barra de filtros (gap `--space-3`, quebra no mobile): `SearchField` (rótulo oculto "Buscar no
   catálogo"), `Select` "Tipo" e `Select` "Status" com rótulos visíveis acima. Os filtros vão
   para a URL (`searchParams`), não para estado global.
3. Contagem "N ativos" em `caption`, `aria-live="polite"` (muda ao filtrar).
4. Grade de `AssetCard` (gap `--space-4`): 1 coluna, 2 a partir de `md`, 3 a partir de `lg`. O
   título de cada card é um link para `/catalogo/[assetId]`. Cada card mostra a versão ativa,
   ou a mais recente quando não há ativa.

## Textos da interface

| Lugar | Texto |
| --- | --- |
| Título | Catálogo |
| Descrição | Templates, modelos, prompts, mídias e kits de marca usados nas receitas. |
| Ação | Enviar ativo |
| Busca (rótulo oculto e placeholder) | Buscar no catálogo · Buscar por nome, etiqueta ou nota |
| Filtro de tipo | Tipo · Todos |
| Filtro de status | Status · Todos · Rascunho · Ativo · Descontinuado |
| Contagem | 1 ativo · N ativos |
| Vazio (catálogo sem itens) | Título "O catálogo está vazio" · "Envie um arquivo ou rode `studio catalog seed` para importar os ativos do ai-creator-engine." · ação "Enviar ativo" |
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

## Estados

| Estado | Comportamento |
| --- | --- |
| Carregando | Spinner `md` centralizado na área da grade (padding `--space-10`), com `label` "Carregando o catálogo" |
| Vazio | EmptyState conforme a tabela |
| Erro | ErrorState com "Tentar de novo" |
| Sucesso | Grade |

## Acessibilidade

- O título de cada card é o único link do card (stretched link); Tab passa de card em card.
- A busca está em `role="search"`; o resultado é anunciado pela contagem `aria-live`.
- Sensibilidade "Biométrico" e "Terceiros" sempre como texto no badge.

## Componentes usados

`PageHeader`, `buttonClassName`, `SearchField`, `FormField`, `Select`, `AssetCard`,
`StatusBadge`, `Badge`, `EmptyState`, `ErrorState`, `Spinner`.
