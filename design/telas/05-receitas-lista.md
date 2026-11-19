# Tela 05 — Receitas: lista

| Item | Valor |
| --- | --- |
| Rota | `/receitas` |
| Título do documento | `Receitas · Video Studio` |
| Ticket | R1-19 (critério 8) |

## Objetivo

Ver as receitas (combinações versionadas de ativos ligadas a um grafo, PRD 6), abrir uma para
editar, criar uma nova e iniciar uma execução a partir dela.

## Wireframe — desktop

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Receitas                                               [Nova receita]    │
│ Combinações salvas de ativos e etapas para gerar um vídeo.               │
│                                                                          │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ RECEITA            ID@VERSÃO              FORMATO   STATUS  AÇÕES    │ │
│ │ Product tour 16:9  product-tour-16x9@1    1920x1080 (Ativo) [Executar]│ │
│ │ Tool Demo 9:16     tool-demo-9x16@1       1080x1920 (Ativo) [Executar]│ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

Mobile: a tabela rola na horizontal dentro do contêiner focável.

## Estrutura

1. `PageHeader` com ação Button `primary` "Nova receita" (link para `/receitas/nova`).
2. `Table` com caption oculta "Receitas" e colunas:
   - Receita (`rowHeader`, link para `/receitas/[recipeId]`);
   - Id@versão (`mono`);
   - Formato (largura x altura, fps);
   - Etapas (número de etapas ligadas, `align="end"`);
   - Status (`StatusBadge kind="asset"`, receitas seguem as regras de versão dos ativos);
   - Ações: link com `buttonClassName({ variant: 'secondary', size: 'sm' })` "Executar" para
     `/execucoes/nova?receita=[recipeId]@[versão]`.

## Textos da interface

| Lugar | Texto |
| --- | --- |
| Título / descrição | Receitas · Combinações salvas de ativos e etapas para gerar um vídeo. |
| Ação | Nova receita |
| Colunas | Receita · Id@versão · Formato · Etapas · Status · Ações |
| Ação da linha | Executar |
| Vazio | EmptyState "Nenhuma receita ainda" · "Crie uma receita escolhendo ativos do catálogo, ou rode `studio catalog seed` para importar as duas receitas iniciais." · "Nova receita" |
| Erro | ErrorState "Não foi possível carregar as receitas" · "Tentar de novo" |

## Estados

Carregando: Spinner `md` centralizado com `label` "Carregando as receitas". Vazio, erro e
sucesso conforme a tabela.

## Acessibilidade

O nome da receita é `<th scope="row">`; o link "Executar" ganha texto oculto com o nome da
receita ("Executar <span class="visually-hidden">Product tour 16:9</span>").

## Componentes usados

`PageHeader`, `buttonClassName`, `Table`, `StatusBadge`, `EmptyState`, `ErrorState`, `Spinner`.
