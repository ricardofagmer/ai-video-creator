# Tela 06 — Receita: editor com vínculos

| Item | Valor |
| --- | --- |
| Rotas | `/receitas/nova` e `/receitas/[recipeId]` (versão aberta em `?versao=N`) |
| Título do documento | `Nova receita · Video Studio` / `<nome> · Receitas · Video Studio` |
| Ticket | R1-19 (critério 8) |

## Objetivo

Montar uma receita (PRD 6): escolher etapas do grafo, fixar cada slot em um `assetId@version`
do catálogo, definir formato, portões e entradas do briefing, e salvar como nova versão.

## Wireframe — desktop

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Receitas                                                               │
│ Product tour 16:9  (Ativo)  v1                  [Versões ▾] [Executar]   │
│ product-tour-16x9@1                                                      │
│                                                                          │
│ ┌ Identificação ───────────────────────────────────────────────────────┐ │
│ │ Nome [Product tour 16:9     ]   Id [product-tour-16x9]               │ │
│ ├ Formato ─────────────────────────────────────────────────────────────┤ │
│ │ Largura [1920] Altura [1080] FPS [30] Duração [60]–[120] s           │ │
│ │ Idioma [pt-BR ▾]  Loudness alvo [-16] LUFS  Pico [-1] dBFS           │ │
│ ├ Etapas ──────────────────────────────────────────────────────────────┤ │
│ │ PRÉ-PRODUÇÃO  [x] Plano  [x] Pesquisa  [x] Verificação  [x] Roteiro  │ │
│ │ PRODUÇÃO      [x] Captura [x] Cenas [x] Narração                     │ │
│ │ PÓS-PRODUÇÃO  [x] Composição [x] Legendas [x] Fades [x] Música       │ │
│ │ ENTREGA       [x] QA  [x] Revisão do agente  [x] Pacote              │ │
│ ├ Vínculos ────────────────────────────────────────────────────────────┤ │
│ │ Template  template        [spesia-tour@1              ▾]             │ │
│ │ Aceita: template                                                     │ │
│ │ Voz  voice                [voz-ricardo@1              ▾]             │ │
│ │ Prompt do roteirista  prompt.scriptwriter [scriptwriter@2 ▾]         │ │
│ ├ Portões ─────────────────────────────────────────────────────────────┤ │
│ │ [x] Aprovação do plano (sempre)  [x] Revisão final (sempre)          │ │
│ │ [ ] Aprovação do roteiro                                             │ │
│ ├ Entradas do briefing ────────────────────────────────────────────────┤ │
│ │ [x] Tema  [x] URL de origem  [ ] Alvo da captura  [x] Mensagens-chave │ │
│ ├ Checklist da revisão ────────────────────────────────────────────────┤ │
│ │ 8 itens · [x] obrigatório em cada um                                 │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│                                      [Cancelar] [Salvar como versão 2]   │
└──────────────────────────────────────────────────────────────────────────┘
```

## Estrutura

1. `PageHeader`: "← Receitas"; título; `meta` = StatusBadge + "vN" em `mono`; descrição =
   `recipeId@version` em `mono`; ações: `Select` compacto "Versões" (abre `?versao=N`) e link
   `buttonClassName({ variant: 'secondary' })` "Executar" (para `/execucoes/nova?receita=…`).
   Em `/receitas/nova` não há versões nem "Executar".
2. Um `<form>` com Cards-fieldset empilhados (gap `--space-6`), ocupando a largura do conteúdo
   (`--layout-max-width`); dentro de cada card, uma coluna no mobile:
   - **Identificação**: Nome; Id (`Input mono`, só editável em receita nova).
   - **Formato**: Largura, Altura, FPS, Duração mínima e máxima (s), Idioma (`Select`, padrão
     pt-BR), Loudness alvo (LUFS), Pico máximo (dBFS). Campos lado a lado a partir de `sm`.
   - **Etapas**: para cada fase, `overline` com o nome da fase e um `Checkbox` por etapa (A5).
     Desligar uma etapa remove seus slots dos vínculos.
   - **Vínculos**: `BindingList`, um slot por ativo exigido pelas etapas ligadas; cada controle é
     um `Select` só com versões `active` dos tipos aceitos ("Aceita: …"). Slot opcional mostra
     "(opcional)".
   - **Portões**: `Checkbox` desabilitado e marcado para "Aprovação do plano" e "Revisão final"
     (sempre presentes, PRD 7.3); `Checkbox` livre para "Aprovação do roteiro".
   - **Entradas do briefing**: `Checkbox` por entrada exigida do briefing (PRD 6 `inputs`).
   - **Checklist da revisão**: os itens (textos de `componentes-estudio.md`, seção 15) com um
     `Checkbox` "Obrigatório" por item.
3. Rodapé fixo ao fim do form: "Cancelar" (secondary) e "Salvar como versão N+1" (primary,
   submit; receita nova: "Salvar receita"); carregando "Salvando…".

## Regras visíveis

- Salvar sempre cria uma versão nova; a versão aberta não muda (PRD 5.4 aplicada a receitas).
- Um slot sem versão ativa compatível mostra o erro "Nenhuma versão ativa de {tipo} no
  catálogo." e um link "Enviar ativo".
- Enviar com erro leva o foco ao primeiro campo inválido e mostra Alert `error` no topo com o
  número de problemas: "Corrija 2 campos antes de salvar."

## Textos da interface

| Lugar | Texto |
| --- | --- |
| Cards | Identificação · Formato · Etapas · Vínculos · Portões · Entradas do briefing · Checklist da revisão |
| Formato | Largura · Altura · FPS · Duração mínima (s) · Duração máxima (s) · Idioma · Loudness alvo (LUFS) · Pico máximo (dBFS) |
| Fases | Pré-produção · Produção · Pós-produção · Entrega |
| Etapas (`StageId`, A5) | `plan` Plano · `research` Pesquisa · `verify` Verificação de fatos · `script` Roteiro · `capture` Captura · `scenes` Cenas · `narration` Narração · `composition` Composição · `captions` Legendas · `fades` Fades · `music` Música · `qa` QA técnico · `agent-review` Revisão do agente · `package` Pacote |
| Portões | Aprovação do plano (sempre) · Revisão final (sempre) · Aprovação do roteiro |
| Entradas | Tema · URL de origem · Alvo da captura · Mensagens-chave |
| Ajuda do slot | Aceita: {tipos} |
| Botões | Cancelar · Salvar receita · Salvar como versão {N+1} · Salvando… · Executar |
| Sucesso | Alert `success` "Receita salva como versão {N}." |

## Acessibilidade

Cada Card do form é um `<fieldset>` com legenda; os checkboxes de etapa de cada fase ficam num
`<fieldset>` com a fase como legenda. Os checkboxes fixos de portão têm descrição "Sempre
presente em toda receita."

## Componentes usados

`PageHeader`, `buttonClassName`, `textLinkClassName`, `StatusBadge`, `Card`, `FormField`,
`Input`, `Select`, `Checkbox`, `BindingList`, `Button`, `Alert`.
