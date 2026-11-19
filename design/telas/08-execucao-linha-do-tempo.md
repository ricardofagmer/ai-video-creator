# Tela 08 — Execução: linha do tempo ao vivo

| Item | Valor |
| --- | --- |
| Rota | `/execucoes/[runId]` |
| Título do documento | `<runId> · Execuções · Video Studio` |
| Ticket | R1-20 (critérios 10, 12, 14, 15, 16, 20) |

## Objetivo

Acompanhar uma execução ao vivo a partir de `now.json` e `events.jsonl` (atualização em até 2 s;
a web consulta a api a cada 1 s, A17): fases, etapas e os sete passos com status, o que está
acontecendo agora, os eventos, o custo, e pausar, parar ou retomar. Mostrar o estado
"Aguardando você" com o texto "o que fazer".

## Wireframe — desktop (a partir de `lg`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Execuções                                                              │
│ 2026-11-18-002  (• Em execução)                         [Abrir revisão]  │
│ Product tour 16:9 · product-tour-16x9@1 · iniciada 18/11/2026 14:02      │
│                                                                          │
│ ┌ Linha do tempo (2/3) ───────────────────┐ ┌ Agora ──── (• Em execução)┐ │
│ │ PRÉ-PRODUÇÃO                            │ │ Narração · Execução       │ │
│ │ ● Plano            (Concluído) US$0,03  │ │ Gerando a narração da     │ │
│ │ ● Roteiro          (Concluído) US$0,08  │ │ cena 3 de 8               │ │
│ │ PRODUÇÃO                                │ │ atualizado há 1 s         │ │
│ │ ● Captura (Concluído com recuperação)   │ │ ───────────────────────── │ │
│ │ ▾ Narração         (• Em execução)      │ │ [Pausar] [Parar]          │ │
│ │   ● Briefing        (Concluído) 2 s     │ └───────────────────────────┘ │
│ │   ● Pré-checagem    (Concluído) 1 s     │ ┌ Custo ────────────────────┐ │
│ │   ● Registro de entradas (Concluído)    │ │ US$ 0,42 de US$ 5,00      │ │
│ │  [● Execução        (• Em execução)]    │ │ [====|---------------]    │ │
│ │   ○ Verificação     (Pendente)          │ └───────────────────────────┘ │
│ │   ○ Arquivamento    (Pendente)          │                               │
│ │   ○ Registro        (Pendente)          │                               │
│ │ PÓS-PRODUÇÃO …                          │                               │
│ └─────────────────────────────────────────┘                               │
│ ┌ Eventos ─────────────────────────────────────────────────────────────┐ │
│ │ 14:05:12  INFO   narração · execução: cena 3 de 8 iniciada           │ │
│ │ 14:04:58  AVISO  captura · verificação: repetida após recuperação    │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

Abaixo de `lg`: uma coluna na ordem Agora → aviso (se houver) → Custo → Linha do tempo → Eventos.

## Estrutura

1. `PageHeader`: "← Execuções"; título = `runId` em `mono`; `meta` = `StatusBadge kind="run"`;
   descrição = "Receita · `recipeId@version` · iniciada dd/mm/aaaa hh:mm"; ação "Abrir revisão"
   (link primary) só quando o status é `review`, `approved` ou `rejected`.
2. Quando o status é `waiting`: `WaitingNotice` acima de tudo, com o motivo e o "o que fazer"
   escritos pelo motor e as ações do portão (portão `plan`: tela 07; erro de autenticação,
   licença, afirmação sem evidência, biométrico ou custo: só "Retomar" depois de resolver, ou
   nenhuma ação quando o texto pede uma ação fora da web).
3. Grade a partir de `lg`: coluna principal 2/3 e lateral 1/3, gap `--space-6`.
   - Principal: Card "Linha do tempo" com `StepTimeline` (`current` vindo de `now.json`).
   - Lateral: `NowPanel` com `actions` = `RunControls` (mapa de disponibilidade em
     `componentes-estudio.md`, seção 6); Card "Custo" com `CostMeter` "Custo da execução"
     (`totals` de `cost.json` contra `limits.costPerRunUsd`).
4. Card "Eventos" na largura inteira com `EventLog` (últimos 200 eventos; mais antigo em cima).
5. Execução `failed`: `Alert` `error` com título "A execução falhou" e o motivo registrado no
   `run.json`; a etapa que falhou abre sozinha na linha do tempo.
6. Execução `interrupted`: `Alert` `warning` "A execução foi interrompida" · "O watcher parou no
   meio de um passo. Ele retoma deste passo quando voltar; você também pode retomar agora."

## Textos da interface

| Lugar | Texto |
| --- | --- |
| Cards | Linha do tempo · Agora · Custo · Eventos |
| Agora (sem passo) | Esperando o watcher iniciar a execução |
| Atualização | atualizado há {N} s · sem atualização há {N} s (acima de 5 s, em `--color-warning`) |
| Controles | Pausar · Retomar · Parar · Pausando… · Retomando… · Parando… |
| Pausa pedida (Alert `info`) | Pausa pedida. A execução para depois do passo atual. |
| Pausada | StatusBadge "Pausada"; NowPanel "Pausada em {etapa} · {passo}" |
| Falha | A execução falhou · {motivo} |
| Interrompida | A execução foi interrompida · O watcher parou no meio de um passo. Ele retoma deste passo quando voltar; você também pode retomar agora. |
| Revisão | Abrir revisão |
| Passos (`StepName`) | Briefing · Pré-checagem · Registro de entradas · Execução · Verificação · Arquivamento · Registro |
| Erro de carga | ErrorState "Não foi possível carregar a execução" · "Tentar de novo" |
| Não encontrada | EmptyState "Execução não encontrada" · "Voltar às execuções" |

## Estados

| Estado | Comportamento |
| --- | --- |
| Primeira carga | Spinner `md` com `label` "Carregando a execução" |
| Ao vivo | Consulta de 1 s; só os nós que mudaram re-renderizam; o foco nunca se move |
| Api sem resposta | Mantém o último estado, "sem atualização há N s" em aviso, `WatcherIndicator` "Watcher sem resposta" |
| Pausa vinda da CLI | Aparece em até 2 s sem recarregar (critério 14) |
| Terminal (`review`, `approved`, `rejected`, `failed`) | Consulta para; RunControls some |

## Acessibilidade

- `NowPanel` anuncia a posição e a mensagem em `aria-live="polite"`; o `EventLog` é `role="log"`.
  Para não repetir anúncios, a mensagem do NowPanel só muda quando o passo muda.
- O passo atual tem `aria-current="step"`; cada etapa abre com Enter/Espaço.
- O Dialog de "Parar" é `alertdialog`; o foco volta para "Parar" ao cancelar.

## Componentes usados

`PageHeader`, `buttonClassName`, `StatusBadge`, `WaitingNotice`, `Card`, `StepTimeline`,
`NowPanel`, `RunControls`, `Dialog`, `CostMeter`, `EventLog`, `Alert`, `WatcherIndicator`,
`EmptyState`, `ErrorState`, `Spinner`.
