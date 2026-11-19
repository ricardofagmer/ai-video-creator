# Tela 07 — Execuções: lista, nova execução e aprovação do plano

| Item | Valor |
| --- | --- |
| Rotas | `/execucoes` (lista, página inicial), `/execucoes/nova?receita=<id>@<versão>` |
| Título do documento | `Execuções · Video Studio` / `Nova execução · Video Studio` |
| Ticket | R1-20 (critérios 8, 14, 20, 28) |

## Objetivo

Ver todas as execuções e seu status; começar uma execução a partir de uma receita com o
briefing e referências da execução; revisar e aprovar o plano resolvido (etapas, versões fixadas,
estimativa de custo) antes de qualquer etapa rodar (PRD 6 passos 2-3, K2).

## Wireframe — lista

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Execuções                                             [Nova execução]    │
│ Vídeos em produção e já entregues.                                       │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ EXECUÇÃO          RECEITA              STATUS           ETAPA   CUSTO │ │
│ │ 2026-11-18-002    product-tour-16x9@1  (• Em execução)  Narração 0,42 │ │
│ │ 2026-11-18-001    tool-demo-9x16@1     (Aguardando você) Plano   0,03 │ │
│ │ 2026-11-17-004    tool-demo-9x16@1     (Em revisão)     —       1,10 │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

## Wireframe — nova execução

```
┌──────────────────────────────────────────────────────────────┐
│ ← Execuções                                                  │
│ Nova execução                                                │
│ ┌ Receita ─────────────────────────────────────────────────┐ │
│ │ Receita [Product tour 16:9 · v1                    ▾]    │ │
│ ├ Briefing ────────────────────────────────────────────────┤ │
│ │ Tema [                                  ]                │ │
│ │ URL de origem [https://…                ]                │ │
│ │ Mensagens-chave [                       ]  (Textarea)    │ │
│ ├ Referências desta execução (opcional) ───────────────────┤ │
│ │ ┌ - - - - - - - - - - - - - - - - - - - - - - - - - - ┐  │ │
│ │ │   Arraste arquivos para cá   [Escolher arquivos]    │  │ │
│ │ └ - - - - - - - - - - - - - - - - - - - - - - - - - - ┘  │ │
│ └──────────────────────────────────────────────────────────┘ │
│                               [Cancelar] [Iniciar execução]  │
└──────────────────────────────────────────────────────────────┘
```

## Wireframe — aprovação do plano (dentro de `/execucoes/[runId]`, status `waiting` no portão `plan`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ▌Aguardando você                                                          │
│ ▌O plano está pronto e nenhuma etapa rodou ainda.                         │
│ ▌O que fazer: confira etapas, versões e custo e aprove ou recuse o plano. │
│ ▌[Aprovar plano] [Recusar plano]                                          │
│ ┌ Plano resolvido ─────────────────────────────────────────────────────┐ │
│ │ ETAPA       ATIVOS FIXADOS                          ESTIMATIVA       │ │
│ │ Roteiro     scriptwriter@2 (3f9a1c…)                US$ 0,08         │ │
│ │ Narração    voz-ricardo@1 (9b2e44…)                 US$ 0,00         │ │
│ │ Composição  spesia-tour@1 (a1c3d9…)                 US$ 0,00         │ │
│ ├──────────────────────────────────────────────────────────────────────┤ │
│ │ Custo da execução   US$ 0,00 de US$ 5,00   [|------------------]     │ │
│ │ Estimativa do plano: US$ 0,31                                        │ │
│ │ Mês                 US$ 12,40 de US$ 50,00 [=====|------------]      │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

## Estrutura

### Lista

1. `PageHeader` com Button `primary` "Nova execução" (link para `/execucoes/nova`).
2. `Table` caption oculta "Execuções": Execução (`rowHeader`, link para `/execucoes/[runId]`,
   `mono`), Receita (`mono`), Status (`StatusBadge kind="run"`), Etapa atual, Custo (USD,
   `align="end"`), Início (data e hora). Mais nova primeiro. Atualiza a cada 1 s enquanto houver
   execução não terminal na página (A17).

### Nova execução

1. `PageHeader` com "← Execuções".
2. Card "Receita": `FormField` "Receita" com `Select` das versões ativas (pré-selecionada pelo
   `?receita=`).
3. Card "Briefing": um `FormField` por entrada que a receita exige (Tema e Alvo da captura em
   `Input`; URL de origem em `Input type="url"`; Mensagens-chave em `Textarea`).
4. Card "Referências desta execução" (opcional): `UploadDropzone` `multiple`, ajuda "Imagens,
   vídeos ou áudios usados só nesta execução."
5. Rodapé: "Cancelar" e "Iniciar execução" (primary, submit, "Iniciando…"). Sucesso: vai para
   `/execucoes/[runId]`, onde o plano aparece quando o Planner termina.

### Aprovação do plano (portão `plan`)

1. `WaitingNotice` com motivo, "o que fazer" e ações Button `primary` "Aprovar plano" e Button
   `secondary` "Recusar plano" (abre Dialog com `Textarea` "Motivo" obrigatório).
2. Card "Plano resolvido": `Table` caption "Plano resolvido" com Etapa (`rowHeader`), Ativos
   fixados (`assetId@version` em mono + hash curto) e Estimativa (`align="end"`).
3. Dois `CostMeter`: "Custo da execução" (`limits.costPerRunUsd`, com `estimateUsd`) e "Gasto do
   mês" (`limits.costPerMonthUsd`, gasto do mês + estimativa).

## Textos da interface

| Lugar | Texto |
| --- | --- |
| Lista | Execuções · Vídeos em produção e já entregues. · Nova execução |
| Colunas | Execução · Receita · Status · Etapa atual · Custo · Início |
| Lista vazia | EmptyState "Nenhuma execução ainda" · "Escolha uma receita e inicie a primeira execução." · "Nova execução" |
| Nova | Nova execução · Receita · Briefing · Referências desta execução · Iniciar execução · Iniciando… · Cancelar |
| Plano: motivo | O plano está pronto e nenhuma etapa rodou ainda. |
| Plano: o que fazer | confira etapas, versões e custo e aprove ou recuse o plano. |
| Plano: ações | Aprovar plano · Aprovando… · Recusar plano |
| Recusar (Dialog) | Recusar o plano? · "A execução termina sem rodar nenhuma etapa." · Motivo · Cancelar · Recusar plano |
| Custo acima do limite (motivo do WaitingNotice) | A estimativa passa do limite de custo por execução. |
| Mês acima do limite (motivo) | O gasto do mês mais esta estimativa passa do limite mensal. |
| Limite: o que fazer | aumente o limite na receita ou reduza as etapas e inicie de novo. |
| Medidores | Custo da execução · Gasto do mês · Estimativa do plano: {valor} |

## Estados

- Lista: carregando com Spinner; erro com ErrorState "Não foi possível carregar as execuções".
- Nova: erros inline por campo; falha do servidor em Alert `error`.
- Plano: enquanto o Planner trabalha, `NowPanel` mostra "Plano · Execução" com a mensagem
  "Montando o plano da execução"; o Card "Plano resolvido" aparece quando o plano existe.

## Acessibilidade

- A atualização de 1 s não move o foco nem relê a tabela inteira: só o StatusBadge muda.
- "Aprovar plano" e "Recusar plano" são os primeiros botões depois do título do aviso.

## Componentes usados

`PageHeader`, `buttonClassName`, `Table`, `StatusBadge`, `Card`, `FormField`, `Select`,
`Input`, `Textarea`, `UploadDropzone`, `Button`, `WaitingNotice`, `CostMeter`, `Dialog`,
`NowPanel`, `EmptyState`, `ErrorState`, `Spinner`, `Alert`.
