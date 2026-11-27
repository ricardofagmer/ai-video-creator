# Componentes base

Componentes genéricos que `packages/ui` implementa (React 19 + CSS Modules) e que as telas
compõem. Todo valor visual vem de `tokens.md`. Os componentes específicos do estúdio estão em
`componentes-estudio.md`.

## Regras gerais

- **Bordas**: `1px` (`2px` no Spinner, na dropzone e no marcador de estimativa do CostMeter;
  `4px` na barra lateral do Alert). Espessura de borda não é token.
- **Foco**: todo elemento interativo mostra, em `:focus-visible`,
  `outline: var(--focus-ring-width) solid var(--color-focus-ring)` com
  `outline-offset: var(--focus-ring-offset)`.
- **Transições**: cor de fundo, de borda e de texto mudam em `--duration-fast` com
  `--ease-standard`; instantâneas com `prefers-reduced-motion: reduce`.
- **Desabilitado**: texto e borda `--color-text-disabled`, fundo `--color-surface-muted`, cursor
  `not-allowed`; isento de contraste.
- **Sem margem externa**: o espaço entre componentes é dado pela tela (exceção: PageHeader, que
  traz `--space-6` abaixo).
- **Textos padrão** dos componentes (por exemplo "Carregando", "Pular para o conteúdo") vêm de
  `uiMessages` no idioma ativo (pt-BR, es ou en; veja `glossario.md`) e podem ser trocados por
  props; os textos de cada tela estão em `telas/*.md`.
- **Server e client**: componentes sem estado rodam como Server Components. `Dialog`,
  `UploadDropzone` e `RunControls` são `'use client'`. Componentes que recebem callbacks
  (`RatingInput`, `Checklist`) são usados dentro de um formulário client.

---

## 1. Button

`<button>` com variantes; `buttonClassName()` dá a mesma aparência a um link (`next/link`).

| Variante | Fundo | Texto | Borda | Hover |
| --- | --- | --- | --- | --- |
| `primary` | `--color-primary` | `--color-text-on-primary` | transparente | `--color-primary-hover` |
| `secondary` | `--color-surface` | `--color-text` | `--color-border-strong` | `--color-surface-muted` |
| `ghost` | transparente | `--color-text` | transparente | `--color-surface-muted` |
| `danger` | `--color-danger` | `--color-text-on-primary` | transparente | `--color-danger-hover` |

| Tamanho | Altura | Padding horizontal | Fonte |
| --- | --- | --- | --- |
| `sm` | `--control-height-sm` | `--space-3` | `--font-size-sm` |
| `md` (padrão) | `--control-height-md` | `--space-4` | `--font-size-sm` |
| `lg` | `--control-height-lg` | `--space-6` | `--font-size-md` |

- Raio `--radius-md`, gap `--space-2`, peso medium, sem quebra de linha. `block` ocupa 100 %.
- **Carregando** (`loading`): Spinner `sm` antes do rótulo, `disabled` e `aria-busy="true"`; o
  rótulo pode virar `loadingLabel` ("Salvando…") sem o botão encolher.
- No máximo um `primary` por bloco de ação. Navegação é link, nunca `<button>` com `onClick`.
- `type="button"` por padrão; `type="submit"` só no botão que envia o formulário.

## 2. Spinner

Círculo de `2px`: trilho em `currentColor` a 25 %, arco superior sólido, uma volta em
`--duration-spin`. Tamanhos `sm` (`--size-icon-sm`) e `md` (`--size-icon-md`). Sozinho é
`role="status"` com texto oculto "Carregando"; dentro do Button é decorativo
(`aria-hidden="true"`).

## 3. Link de texto

`textLinkClassName()`: `--color-primary`, peso medium, sublinhado com deslocamento
`calc(var(--space-1) / 2)`; hover `--color-primary-hover`.

## 4. Campos de formulário

### 4.1 Label e FormField

- `Label`: estilo `label`. Campos são obrigatórios por padrão; um campo opcional mostra
  " (opcional)" em `--color-text-muted`, peso regular.
- `FormField`: coluna com gap `--space-2`: Label → controle → ajuda **ou** erro. Recebe o
  controle por render prop, que ganha `id`, `aria-describedby` (`{id}-help` ou `{id}-error`),
  `aria-required="true"` (campos obrigatórios) e `invalid`.
- Ajuda: estilo `caption`. Erro: `--font-size-sm`, `--color-danger`; o erro substitui a ajuda.

### 4.2 Input, Textarea, Select

| Parte | Valor |
| --- | --- |
| Altura mínima | `--control-height-md` (Textarea: 3 ×, redimensionável na vertical) |
| Padding | `--space-2` `--space-4` |
| Fonte | `--font-size-md`, `--color-text`; placeholder `--color-text-subtle` |
| Fundo / borda | `--color-surface` / `--color-border-strong`, raio `--radius-md` |
| Foco | contorno de foco + borda `--color-focus-ring` |
| Erro | borda `--color-danger` e `aria-invalid="true"` |
| Somente leitura | fundo `--color-surface-muted` |

- `Input mono`: `--font-mono` (refs, hashes, caminhos).
- `Select`: nativo, com seta desenhada por bordas em `--color-text-muted` (sem imagem). A opção
  `placeholder` ("Selecione…") fica desabilitada.

### 4.3 Checkbox

Checkbox nativo de `--size-icon-md` com `accent-color: var(--color-primary)`, rótulo `label` à
direita e descrição opcional `caption` ligada por `aria-describedby`.

### 4.4 RadioGroup

`<fieldset>` com legenda `label` e rádios nativos (setas do teclado mudam a escolha), com a
mesma aparência do Checkbox (`--size-icon-md`, `accent-color: var(--color-primary)`), descrição
opcional por opção em `caption`. Opções empilhadas com gap `--space-3`; `inline` lado a lado a
partir de `sm` (gap `--space-6`). Erro abaixo, ligado ao grupo por `aria-describedby`.

### 4.5 SearchField

Input `type="search"` dentro de `role="search"`, com rótulo oculto (`visually-hidden`); largura
máxima `--layout-form-max-width`.

## 5. Card

Superfície `--color-surface`, borda `--color-border`, raio `--radius-lg`, sombra `--shadow-sm`,
padding `--space-5` (a partir de `md`: `--space-6`), gap interno `--space-4`.

- Cabeçalho: título `heading-3` (nível `h2` a `h4`), descrição `caption`, ações à direita.
  Exceção: quando o card é o único conteúdo da página (login), o título é `h1` com aparência
  `heading-3`, para a página manter um único `h1` (decisão do dono, 2026-11-19).
- Com título, o card é `<section aria-labelledby>`.
- Rodapé: ações à direita, separadas por uma borda superior `--color-border`.

## 6. Badge

Rótulo curto: `--font-size-xs`, peso medium, raio `--radius-sm`, padding
`calc(var(--space-1) / 2)` `--space-2`. Marcador opcional de `--size-status-dot` em
`currentColor`; `live` pulsa em `--duration-pulse`.

| Tom | Texto | Fundo | Borda |
| --- | --- | --- | --- |
| `neutral` | `--color-status-neutral` | `--color-status-neutral-soft` | `--color-border` |
| `active` | `--color-primary-soft-text` | `--color-status-active-soft` | transparente |
| `info` | `--color-info` | `--color-info-soft` | `--color-info-border` |
| `success` | `--color-success` | `--color-success-soft` | `--color-success-border` |
| `warning` | `--color-warning` | `--color-warning-soft` | `--color-warning-border` |
| `danger` | `--color-danger` | `--color-danger-soft` | `--color-danger-border` |

O texto sempre diz o estado; a cor nunca é o único sinal.

## 7. Alert

Bloco de mensagem: padding `--space-3` `--space-4`, raio `--radius-md`, barra lateral de `4px`
na cor do tom, título em semibold na cor do tom, mensagem em `--color-text`, ações opcionais.
Entrada com `--duration-normal` e `--ease-out`.

| Variante | Fundo | Borda | Barra e título | Papel ARIA |
| --- | --- | --- | --- | --- |
| `success` | `--color-success-soft` | `--color-success-border` | `--color-success` | `status` |
| `info` | `--color-info-soft` | `--color-info-border` | `--color-info` | `status` |
| `warning` | `--color-warning-soft` | `--color-warning-border` | `--color-warning` | `alert` |
| `error` | `--color-danger-soft` | `--color-danger-border` | `--color-danger` | `alert` |

## 8. Table

- Contêiner com borda `--color-border`, raio `--radius-md`, rolagem horizontal; é uma
  `region` focável com o nome da tabela, para rolar pelo teclado.
- `<caption>` sempre presente (visível em `caption` ou oculta).
- Cabeçalho: `--font-size-xs`, semibold, maiúsculas, `--color-text-muted` sobre
  `--color-surface-muted`.
- Células: padding `--space-3`, `--font-size-sm`, divisor `--color-border`; hover da linha
  `--color-surface-muted`. Coluna `align="end"` usa números tabulares.
- A coluna que nomeia a linha vira `<th scope="row">`.
- Vazio: uma linha com o texto da tela em `--color-text-muted`, centralizado, padding
  `--space-8`.

## 9. DescriptionList

`<dl>` de pares termo/valor: termo em `caption`, valor em `--font-size-sm`, `mono` opcional.
Uma coluna, ou duas a partir de `md` (gap de coluna `--space-6`).

## 10. Dialog

`<dialog>` nativo aberto com `showModal()`: foco preso no diálogo, fundo inerte, Escape fecha
(o componente pede `onClose` à tela, que controla `open`), foco volta ao elemento que abriu.

- Largura até `--layout-dialog-width`, padding `--space-6`, raio `--radius-lg`, sombra
  `--shadow-lg`, fundo atrás `--color-overlay`.
- Título `heading-2` (`aria-labelledby`), descrição em `body-sm` `--color-text-muted`
  (`aria-describedby`), rodapé com ações à direita; a ação que confirma fica por último.
- `role="alertdialog"` para confirmações destrutivas (parar execução, rejeitar vídeo): o clique
  no fundo não fecha.

## 11. EmptyState e ErrorState

- **EmptyState**: bloco centralizado, padding `--space-10` `--space-6`, borda tracejada
  `--color-border-strong`, raio `--radius-lg`; marcador circular `--space-10`, título
  `heading-3`, descrição `caption`, uma ação. Estado vazio é projetado, nunca uma área em branco.
- **ErrorState**: mesma forma com borda sólida `--color-danger-border`, fundo
  `--color-danger-soft`, título em `--color-danger`, `role="alert"`. Título padrão: "Não foi
  possível carregar". Nunca mostra stack trace, caminho ou consulta.

## 12. AppShell

- Link "Pular para o conteúdo" (primeiro item focável, aparece no foco) para `<main id="conteudo">`.
- Top bar fixa (`--z-sticky`): fundo `--color-surface`, borda inferior `--color-border`, sombra
  `--shadow-sm`, altura mínima `--layout-topbar-height`.
- Navbar numa linha só, em qualquer largura: botão de menu | Logo | status. Abaixo de `md` a Logo
  usa `compactBelowMd` (só o monograma; o nome fica para leitores de tela). Idioma, tema e "Sair"
  não ficam na navbar: estão na gaveta.
- Gaveta (menu drawer) em qualquer largura: `<dialog>` modal que entra pela esquerda, altura total
  da janela, largura `--layout-auth-card-width` (sempre deixando uma faixa de fundo `--space-12`).
  Três partes: cabeçalho (título "Menu" e botão de fechar, borda inferior `1px` `--color-border`),
  corpo com rolagem própria (`overflow-y: auto`, `overscroll-behavior: contain`) e rodapé da conta
  fixo embaixo, sempre visível. Botão de menu com `aria-expanded`, `aria-controls` e rótulo "Abrir
  menu" / "Fechar menu". Fecha com Escape, clique no fundo, clique num link e voltar/avançar do
  navegador; o foco vai para o botão de fechar ao abrir, fica preso na gaveta e volta ao botão de
  menu ao fechar; a página não rola enquanto a gaveta está aberta. A animação de entrada é
  desligada com `prefers-reduced-motion`.
- Corpo: `<nav aria-label="Principal">` com grupos `DrawerSection` e, abaixo, a seção
  "Preferências" (prop `preferences`).
- `DrawerSection` (`title`, `children`): `role="group"` rotulado pelo título; título em
  maiúsculas, `--font-size-xs`, semibold, `--letter-spacing-eyebrow`, `--color-text-subtle`.
  Divisória `1px` `--color-border` de largura total antes de cada seção, menos a primeira (o
  cabeçalho já desenha a linha).
- Linha de navegação (`navLinkClassName`): ícone `Icon` 20px em `--color-text-muted` + rótulo num
  `<span>`, `--font-sans` `--font-size-sm` medium `--color-text`, altura `--control-height-lg`,
  sem caixa; rótulo longo termina em reticências numa linha. Hover `--color-surface-muted` com a
  barra em gradiente à esquerda; ativo `--color-primary-soft-text` sobre `--color-primary-soft`,
  bold, barra cheia, com `aria-current="page"`.
- `drawerItemClassName()`: o mesmo estilo de linha para um `<button>` (por exemplo "Sair").
- Preferências: uma linha por item (`{ id, label, icon, control }`): ícone, rótulo e o controle
  (Idioma com `LanguageSwitch`, Tema com `ThemeToggle`), altura `--control-height-lg`.
- Rodapé da conta (prop `account`: `name`, `detail`, `menu`): um único botão com avatar redondo
  `--control-height-md` (`--radius-full`, inicial do nome em `--color-on-brand` sobre
  `--gradient-control`), nome bold `--font-size-sm`, segunda linha `--font-size-xs`
  `--color-text-muted` (ambos com reticências) e chevron. O botão tem `aria-expanded` e
  `aria-controls` e abre, logo abaixo, o menu da conta (`role="group"`, "Menu da conta") com o
  "Sair". Com o menu da conta aberto, Escape fecha primeiro esse menu (foco volta ao botão da
  conta) e só o Escape seguinte fecha a gaveta. A gaveta sempre abre com o menu da conta fechado.
- Barra de rolagem: ao travar a página, a largura de uma barra de rolagem clássica vira
  `padding-right` no `<html>`, para o conteúdo não deslocar; nada muda com barras sobrepostas.
- Conteúdo: largura até `--layout-max-width`, padding `--space-6` (a partir de `md`:
  `--space-8`) e margens laterais `--layout-gutter-*`.

## 13. PageHeader

Link de volta opcional (`--font-size-sm`), título `heading-1` (único `<h1>` da página) com
badges ao lado, descrição `caption`, ações à direita (quebram para baixo no mobile). Margem
inferior `--space-6`.

## 14. Logo

Monograma "VC" em quadrado de `--size-logo`, `--color-text-on-primary` sobre `--color-primary`,
raio `--radius-md`, bold; nome "EngineOS Video Creator" em semibold. Versão `compact` esconde o nome
visualmente e o mantém para leitores de tela. `compactBelowMd` faz o mesmo só abaixo de `md`
(768px); usado na navbar do estúdio.

## 15. Icon

Ícone decorativo em traço: `viewBox` 24×24, sem preenchimento, traço `currentColor` largura 2,
pontas e junções arredondadas, `aria-hidden="true"` e `focusable="false"`. Tamanhos `md` (padrão,
`--size-icon-md`) e `sm` (`--size-icon-sm`). Nomes pela forma, não pela página: `menu`, `close`,
`folder`, `clipboard`, `play-circle`, `columns`, `calendar`, `bar-chart`, `trending-up`, `link`,
`globe`, `moon`, `chevron-down`, `log-out`. Sem dependência externa; serve em componentes de
servidor.
