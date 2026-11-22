# Tela 09 — Revisão humana

| Item | Valor |
| --- | --- |
| Rota | `/execucoes/[runId]/revisao` |
| Título do documento | `Revisão · <runId> · EngineOS Video Creator` |
| Ticket | R1-20 (critérios 17, 24, 29) |

## Objetivo

O portão final de toda execução: assistir ao `final.mp4`, ver a evidência de QA, o custo e o
manifesto, dar a nota 1-5, escrever notas, marcar o checklist da receita e aprovar ou rejeitar
(D14). Nenhuma execução chega a `approved` sem esta decisão humana; não existe ação de publicar.

## Wireframe — desktop (a partir de `lg`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Execução 2026-11-18-002                                                │
│ Revisão  (Em revisão)                                                    │
│ Product tour 16:9 · product-tour-16x9@1                                  │
│                                                                          │
│ ┌ Vídeo (7/12) ─────────────────────────────┐ ┌ Sua revisão (5/12) ──────┐ │
│ │ ┌───────────────────────────────────────┐ │ │ Nota                     │ │
│ │ │                                       │ │ │ (1)(2)(3)(4)(5)          │ │
│ │ │              ▶  vídeo                 │ │ │ Muito ruim … Excelente   │ │
│ │ │                                       │ │ │ Notas (opcional)         │ │
│ │ └───────────────────────────────────────┘ │ │ [                      ] │ │
│ │ 1:34 · 1920x1080 · -16,2 LUFS             │ │ Checklist de publicação  │ │
│ ├ Checagens de qualidade ───────────────────┤ │ 6 de 8 itens marcados    │ │
│ │ 7 de 8 checagens passaram                 │ │ [x] Afirmações verif… (Obrig.)│
│ │ (Passou) Loudness integrado               │ │ [ ] Vídeo assistido… (Obrig.)│
│ │   Medido: -16,2 LUFS · Esperado: -16 ± 1  │ │ …                        │ │
│ │ (Aviso) Revisão do agente  nota 7,5 / 8   │ │ [Rejeitar]  [Aprovar]    │ │
│ ├ Custo ────────────────────────────────────┤ └──────────────────────────┘ │
│ │ Total US$ 1,10   (Table por sessão)       │                              │
│ ├ Manifesto ────────────────────────────────┤                              │
│ │ Receita · ativos fixados com hash · modelos│                             │
│ └───────────────────────────────────────────┘                              │
└──────────────────────────────────────────────────────────────────────────┘
```

Abaixo de `lg`: uma coluna — Vídeo → Sua revisão → Checagens → Custo → Manifesto. 9:16: o
player fica centralizado e limitado em altura (VideoPlayer).

## Estrutura

1. `PageHeader`: "← Execução {runId}"; título "Revisão"; `meta` = `StatusBadge kind="run"`;
   descrição = receita e ref.
2. Coluna principal:
   - Card "Vídeo": `VideoPlayer` (`aspect` da receita, título acessível "Vídeo final da execução
     {runId}", legendas quando existirem), `caption` com duração, resolução e loudness.
   - Card "Checagens de qualidade": `QaResultList` com o link de evidência para cada arquivo em
     `qa/`; a revisão do agente aparece como uma checagem com a nota e o limiar da receita.
   - Card "Custo": `metric` com o total e `Table` caption "Custo por sessão" (Sessão · Agente ou
     ferramenta · Tokens de entrada · Tokens de saída · Cache · USD), total na última linha.
   - Card "Manifesto": `DescriptionList` (Receita, Parâmetros, Modelos) e `Table` "Ativos usados"
     (Slot · `assetId@version` · Hash curto).
3. Coluna lateral, fixa ao rolar a partir de `lg` (`position: sticky`, topo
   `--layout-topbar-height` + `--space-6`): Card "Sua revisão" com um `<form>`:
   - `RatingInput` "Nota" (obrigatória para aprovar e para rejeitar);
   - `FormField` "Notas" opcional com `Textarea` (ajuda "O que funcionou, o que mudar na próxima
     versão.");
   - `Checklist` com os itens da receita;
   - rodapé: Button `secondary` "Rejeitar" (abre Dialog `alertdialog` com `Textarea` "Motivo"
     obrigatório) e Button `primary` `type="submit"` "Aprovar".
4. Depois da decisão: o card vira somente leitura com Alert `success` "Vídeo aprovado em
   dd/mm/aaaa hh:mm." ou Alert `info` "Vídeo rejeitado em dd/mm/aaaa hh:mm.", nota, notas,
   checklist marcado e motivo. Não há botão de publicar.

## Regra de aprovação (R1-20, critério 17)

"Aprovar" envia só quando a nota existe e todos os itens obrigatórios estão marcados. Ao tentar
aprovar sem isso: o Checklist mostra "Marque todos os itens obrigatórios para aprovar.", os itens
que faltam ganham Badge danger e `aria-invalid`, a nota sem valor mostra "Escolha uma nota de 1 a
5.", e o foco vai para o primeiro problema. A api recusa da mesma forma (R1-17); uma recusa do
servidor aparece em Alert `error` no topo do card.

## Textos da interface

| Lugar | Texto |
| --- | --- |
| Voltar | ← Execução {runId} |
| Título | Revisão |
| Cards | Vídeo · Checagens de qualidade · Custo · Manifesto · Sua revisão |
| Nota | Nota · 1 Muito ruim · 2 Ruim · 3 Razoável · 4 Bom · 5 Excelente |
| Notas | Notas (opcional) · O que funcionou, o que mudar na próxima versão. |
| Checklist | Checklist de publicação · {N} de {M} itens marcados · Obrigatório |
| Botões | Aprovar · Aprovando… · Rejeitar |
| Rejeitar (Dialog) | Rejeitar o vídeo? · "A execução termina como rejeitada. A nota e as notas ficam registradas." · Motivo · Cancelar · Rejeitar vídeo |
| Erros | Escolha uma nota de 1 a 5. · Marque todos os itens obrigatórios para aprovar. · Escreva o motivo da rejeição. |
| Custo | Total · Custo por sessão · Sessão · Agente ou ferramenta · Tokens de entrada · Tokens de saída · Cache · USD |
| Manifesto | Receita · Parâmetros · Modelos · Ativos usados · Slot · Ativo · Hash |
| Vídeo ausente | ErrorState "O vídeo final não foi encontrado" · "Confira a pasta da execução com `studio doctor`." |
| Fora de revisão | EmptyState "Esta execução ainda não chegou à revisão" · "Acompanhar a execução" |

## Acessibilidade

- O formulário de revisão vem logo depois do player na ordem de leitura e de foco.
- Nota e checklist são `fieldset` com legenda; os erros são ligados por `aria-describedby` e o
  erro do checklist é `role="alert"`.
- O vídeo tem controles nativos e faixa de legendas em pt-BR.

## Componentes usados

`PageHeader`, `textLinkClassName`, `StatusBadge`, `Card`, `VideoPlayer`, `QaResultList`,
`Table`, `DescriptionList`, `RatingInput`, `FormField`, `Textarea`, `Checklist`, `Button`,
`Dialog`, `Alert`, `Badge`, `EmptyState`, `ErrorState`.
