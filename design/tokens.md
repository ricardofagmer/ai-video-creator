# Tokens do design system

Fonte única dos valores visuais. `packages/ui/src/styles/tokens.css` transcreve cada linha para
CSS variables no seletor `:root`, com o **nome exato** da coluna "Token". Componentes e telas
usam os tokens semânticos; a escala bruta existe só para definir os semânticos.

Dois temas, claro e escuro. Cada token semântico é declarado uma vez com
`light-dark(<claro>, <escuro>)`; `color-scheme: light dark` em `:root` faz o navegador seguir o
sistema operacional, e `data-theme="light"` ou `data-theme="dark"` em `<html>` força um tema.

## 1. Cores

### 1.1 Escala de cinzas (cinza-ardósia)

| Token | Valor |
| --- | --- |
| `--color-white` | `#FFFFFF` |
| `--color-black` | `#000000` |
| `--color-gray-50` | `#F8FAFC` |
| `--color-gray-100` | `#F1F5F9` |
| `--color-gray-200` | `#E2E8F0` |
| `--color-gray-300` | `#CBD5E1` |
| `--color-gray-400` | `#94A3B8` |
| `--color-gray-500` | `#64748B` |
| `--color-gray-600` | `#475569` |
| `--color-gray-700` | `#334155` |
| `--color-gray-800` | `#1E293B` |
| `--color-gray-900` | `#0F172A` |
| `--color-gray-950` | `#020617` |

### 1.2 Primária (violeta)

| Token | Valor |
| --- | --- |
| `--color-primary-50` | `#F5F3FF` |
| `--color-primary-100` | `#EDE9FE` |
| `--color-primary-200` | `#DDD6FE` |
| `--color-primary-300` | `#C4B5FD` |
| `--color-primary-400` | `#A78BFA` |
| `--color-primary-600` | `#7C3AED` |
| `--color-primary-700` | `#6D28D9` |
| `--color-primary-800` | `#5B21B6` |
| `--color-primary-950` | `#2E1065` |

### 1.3 Semânticas de feedback (Alert, Badge, estados)

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `--color-success` | `#15803D` | `#4ADE80` | Texto e marcador de sucesso |
| `--color-success-soft` | `#F0FDF4` | `#052E16` | Fundo de Alert/Badge de sucesso |
| `--color-success-border` | `#BBF7D0` | `#166534` | Borda de Alert/Badge de sucesso |
| `--color-warning` | `#B45309` | `#FBBF24` | Texto e marcador de aviso, "Aguardando você" |
| `--color-warning-soft` | `#FFFBEB` | `#451A03` | Fundo de aviso |
| `--color-warning-border` | `#FDE68A` | `#92400E` | Borda de aviso |
| `--color-danger` | `#B91C1C` | `#F87171` | Erro, falha, botão de perigo |
| `--color-danger-hover` | `#991B1B` | `#FCA5A5` | Hover do botão de perigo |
| `--color-danger-soft` | `#FEF2F2` | `#450A0A` | Fundo de erro |
| `--color-danger-border` | `#FECACA` | `#991B1B` | Borda de erro |
| `--color-info` | `#0369A1` | `#38BDF8` | Informação, run em revisão |
| `--color-info-soft` | `#F0F9FF` | `#082F49` | Fundo informativo |
| `--color-info-border` | `#BAE6FD` | `#075985` | Borda informativa |

### 1.4 Tokens semânticos (os componentes usam só estes e os da seção 1.3)

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `--color-bg` | `--color-gray-50` | `--color-gray-950` | Fundo da página |
| `--color-surface` | `--color-white` | `--color-gray-900` | Cards, top bar, campos, diálogos |
| `--color-surface-muted` | `--color-gray-100` | `--color-gray-800` | Cabeçalho de tabela, hover, badge neutro |
| `--color-border` | `--color-gray-200` | `--color-gray-700` | Bordas de card e divisores (decorativos) |
| `--color-border-strong` | `--color-gray-500` | `--color-gray-400` | Borda de campo e botão secundário (≥ 3:1) |
| `--color-text` | `--color-gray-900` | `--color-gray-50` | Texto principal |
| `--color-text-muted` | `--color-gray-600` | `--color-gray-300` | Texto secundário, ajuda, legendas |
| `--color-text-subtle` | `--color-gray-500` | `--color-gray-400` | Placeholder; só sobre `--color-surface` ou `--color-bg` |
| `--color-text-disabled` | `--color-gray-400` | `--color-gray-500` | Controles desabilitados (isento de contraste) |
| `--color-text-on-primary` | `--color-white` | `--color-gray-950` | Texto sobre `--color-primary` e `--color-danger` |
| `--color-primary` | `--color-primary-700` | `--color-primary-300` | Botão primário, links, item ativo |
| `--color-primary-hover` | `--color-primary-800` | `--color-primary-200` | Hover da primária |
| `--color-primary-soft` | `--color-primary-50` | `--color-primary-950` | Fundo de item ativo, versão aberta, passo atual |
| `--color-primary-soft-text` | `--color-primary-800` | `--color-primary-200` | Texto sobre `--color-primary-soft` |
| `--color-focus-ring` | `--color-primary-600` | `--color-primary-400` | Contorno de foco |
| `--color-overlay` | `rgba(15, 23, 42, 0.5)` | `rgba(2, 6, 23, 0.72)` | Fundo atrás do Dialog |
| `--color-media-bg` | `--color-black` | `--color-black` | Moldura do player de vídeo |
| `--color-shadow-weak` | `rgba(15, 23, 42, 0.06)` | `rgba(0, 0, 0, 0.4)` | Cor das sombras (camada leve) |
| `--color-shadow-strong` | `rgba(15, 23, 42, 0.1)` | `rgba(0, 0, 0, 0.6)` | Cor das sombras (camada forte) |

### 1.5 Tokens de status (StatusBadge, StepTimeline, CostMeter)

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-status-neutral` | `var(--color-text-muted)` | Pendente, pulado, rascunho, pausada |
| `--color-status-neutral-soft` | `var(--color-surface-muted)` | Fundo do badge neutro |
| `--color-status-active` | `var(--color-primary)` | Em execução |
| `--color-status-active-soft` | `var(--color-primary-soft)` | Fundo do badge "Em execução" |
| `--color-meter-track` | `var(--color-surface-muted)` | Trilho do CostMeter |
| `--color-meter-fill` | `var(--color-primary)` | Preenchimento do CostMeter abaixo de 80 % |
| `--color-timeline-line` | `var(--color-border)` | Linha que liga os passos |

Sucesso, aviso e falha usam os tokens da seção 1.3.

## 2. Tipografia

### 2.1 Famílias

| Token | Valor | Uso |
| --- | --- | --- |
| `--font-sans` | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | Todo o texto da interface |
| `--font-mono` | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | `assetId@version`, hash, ids de slot, horários do log |

### 2.2 Escala de tamanhos

| Token | Valor | Uso |
| --- | --- | --- |
| `--font-size-xs` | `12px` | Badge, cabeçalho de tabela, overline |
| `--font-size-sm` | `14px` | Rótulos, ajuda, tabelas, botões `sm`/`md`, log |
| `--font-size-md` | `16px` | Corpo, campos, botão `lg` |
| `--font-size-lg` | `18px` | Título de card, passo atual no painel "Agora" |
| `--font-size-xl` | `20px` | Título de seção e de Dialog |
| `--font-size-2xl` | `24px` | Título de página |
| `--font-size-3xl` | `30px` | Números de destaque (custo total na revisão) |

Campos nunca ficam abaixo de `--font-size-md`.

### 2.3 e 2.4 Pesos e alturas de linha

| Token | Valor |
| --- | --- |
| `--font-weight-regular` | `400` |
| `--font-weight-medium` | `500` |
| `--font-weight-semibold` | `600` |
| `--font-weight-bold` | `700` |
| `--line-height-tight` | `1.25` |
| `--line-height-normal` | `1.5` |

### 2.5 Estilos de texto nomeados

Classes globais de `packages/ui/src/styles/utilities.css`, com o nome da primeira coluna.

| Estilo | Tamanho | Peso | Altura | Cor | Uso |
| --- | --- | --- | --- | --- | --- |
| `heading-1` | `--font-size-2xl` | bold | tight | `--color-text` | Título de página (único `<h1>`) |
| `heading-2` | `--font-size-xl` | semibold | tight | `--color-text` | Título de seção e de Dialog |
| `heading-3` | `--font-size-lg` | semibold | tight | `--color-text` | Título de card |
| `metric` | `--font-size-3xl` | bold | tight | `--color-text` | Número de destaque |
| `body` | `--font-size-md` | regular | normal | `--color-text` | Texto corrido |
| `body-sm` | `--font-size-sm` | regular | normal | `--color-text` | Descrições, itens de lista |
| `label` | `--font-size-sm` | medium | normal | `--color-text` | Rótulo de campo, legenda de grupo |
| `caption` | `--font-size-sm` | regular | normal | `--color-text-muted` | Ajuda, datas, metadados |
| `overline` | `--font-size-xs` | medium | normal | `--color-text-muted` | Tipo do ativo, nome de fase (maiúsculas) |
| `mono` | `--font-size-sm` | — | — | herda | Refs, hashes, ids |
| `visually-hidden` | — | — | — | — | Texto só para leitores de tela |

## 3. Espaçamento (escala de 4 px)

| Token | Valor | Token | Valor |
| --- | --- | --- | --- |
| `--space-0` | `0` | `--space-6` | `24px` |
| `--space-1` | `4px` | `--space-8` | `32px` |
| `--space-2` | `8px` | `--space-10` | `40px` |
| `--space-3` | `12px` | `--space-12` | `48px` |
| `--space-4` | `16px` | `--space-16` | `64px` |
| `--space-5` | `20px` | | |

## 4. Raios

| Token | Valor | Uso |
| --- | --- | --- |
| `--radius-sm` | `4px` | Badge, passo atual |
| `--radius-md` | `8px` | Botões, campos, Alert, tabelas, listas |
| `--radius-lg` | `12px` | Cards, Dialog, dropzone, player |
| `--radius-full` | `9999px` | Marcadores de status, Spinner, nota 1-5, trilho do CostMeter |

## 5. Sombras

A cor das sombras vem de `--color-shadow-weak` e `--color-shadow-strong`, então o tema escuro
escurece as sombras sem outro token.

| Token | Valor | Uso |
| --- | --- | --- |
| `--shadow-sm` | `0 1px 2px 0 weak, 0 1px 3px 0 strong` | Cards, top bar |
| `--shadow-md` | `0 4px 6px -1px strong, 0 2px 4px -2px weak` | Reserva |
| `--shadow-lg` | `0 10px 15px -3px strong, 0 4px 6px -4px strong` | Dialog |

## 6. Foco

| Token | Valor | Uso |
| --- | --- | --- |
| `--focus-ring-width` | `2px` | `outline` de foco |
| `--focus-ring-offset` | `2px` | `outline-offset` |

Foco visível só por teclado (`:focus-visible`), na cor `--color-focus-ring`. Nunca remover o
contorno sem substituí-lo.

## 7. Breakpoints

CSS variables não funcionam em `@media`; as media queries usam o número literal (mobile first).

| Token | Valor | Uso |
| --- | --- | --- |
| `--breakpoint-sm` | `640px` | Campos lado a lado |
| `--breakpoint-md` | `768px` | Navegação na mesma linha da top bar, grids de 2 colunas |
| `--breakpoint-lg` | `1024px` | Linha do tempo + painel lateral; revisão em 2 colunas |
| `--breakpoint-xl` | `1280px` | Largura máxima do conteúdo |

## 8. Layout e tamanhos

| Token | Valor | Uso |
| --- | --- | --- |
| `--layout-max-width` | `1280px` | Largura máxima do conteúdo |
| `--layout-topbar-height` | `64px` | Altura da top bar a partir de `md` |
| `--layout-auth-card-width` | `400px` | Card do login |
| `--layout-form-max-width` | `720px` | Formulários de envio e editor de receita |
| `--layout-gutter-mobile` | `16px` | Margem lateral abaixo de `md` |
| `--layout-gutter-desktop` | `24px` | Margem lateral a partir de `md` |
| `--layout-log-max-height` | `360px` | Altura máxima do EventLog (rola por dentro) |
| `--layout-dialog-width` | `480px` | Largura máxima do Dialog |
| `--control-height-sm` | `32px` | Botão `sm` |
| `--control-height-md` | `40px` | Botão e campo padrão; alvo de toque mínimo |
| `--control-height-lg` | `48px` | Botão `lg`, nota 1-5, linha de etapa |
| `--size-icon-sm` | `16px` | Spinner pequeno |
| `--size-icon-md` | `20px` | Spinner, checkbox |
| `--size-status-dot` | `10px` | Marcador de status (badge, linha do tempo) |
| `--size-logo` | `32px` | Monograma "VS" |
| `--size-meter-height` | `8px` | Altura do trilho do CostMeter |
| `--size-dropzone-min-height` | `160px` | Altura mínima da área de soltar arquivos |

## 9. Z-index

| Token | Valor | Uso |
| --- | --- | --- |
| `--z-base` | `0` | Conteúdo |
| `--z-sticky` | `100` | Top bar |
| `--z-dropdown` | `200` | Reserva |
| `--z-overlay` | `300` | Link "Pular para o conteúdo" (o Dialog usa a camada nativa do topo) |

## 10. Movimento

| Token | Valor | Uso |
| --- | --- | --- |
| `--duration-fast` | `120ms` | Hover e foco |
| `--duration-normal` | `200ms` | Entrada de Alert e Dialog |
| `--duration-slow` | `300ms` | Preenchimento do CostMeter |
| `--duration-spin` | `800ms` | Uma volta do Spinner |
| `--duration-pulse` | `1600ms` | Pulso do marcador "Em execução" |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Transições de estado |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Entradas |

Com `prefers-reduced-motion: reduce`: transições instantâneas, Alert e Dialog sem animação de
entrada, pulso "Em execução" parado (o texto já diz o estado), Spinner com volta de
`--duration-spin` × 2 (a rotação comunica carregamento e não é removida).

## 11. Contraste (WCAG 2.1 AA)

Razões calculadas pela fórmula de luminância relativa da WCAG 2.1 em 2026-11-18. Mínimos:
**4,5:1** para texto normal; **3:1** para texto grande e elementos de UI. Desabilitados são
isentos (WCAG 1.4.3). `--color-border` é decorativo e fica fora da regra de 3:1.

### 11.1 Tema claro

| Texto ou elemento | Fundo | Razão | Resultado |
| --- | --- | --- | --- |
| `--color-text` | `--color-surface` / `--color-bg` / `--color-surface-muted` | 17,85 / 17,06 / 16,30 | Passa |
| `--color-text-muted` | `--color-surface` / `--color-bg` / `--color-surface-muted` | 7,58 / 7,24 / 6,92 | Passa |
| `--color-text-subtle` | `--color-surface` / `--color-bg` | 4,76 / 4,55 | Passa |
| `--color-text-on-primary` | `--color-primary` / `--color-primary-hover` | 7,10 / 8,98 | Passa |
| `--color-primary` (link) | `--color-surface` / `--color-bg` | 7,10 / 6,79 | Passa |
| `--color-primary-soft-text` | `--color-primary-soft` | 8,19 | Passa |
| `--color-success` | `--color-success-soft` / `--color-surface` | 4,79 / 5,02 | Passa |
| `--color-warning` | `--color-warning-soft` / `--color-surface` | 4,84 / 5,02 | Passa |
| `--color-danger` | `--color-danger-soft` / `--color-surface` | 5,91 / 6,47 | Passa |
| `--color-text-on-primary` | `--color-danger` / `--color-danger-hover` | 6,47 / 8,31 | Passa |
| `--color-info` | `--color-info-soft` / `--color-surface` | 5,57 / 5,93 | Passa |
| `--color-border-strong` (UI) | `--color-surface` | 4,76 | Passa (3:1) |
| `--color-focus-ring` (UI) | `--color-surface` / `--color-bg` | 5,70 / 5,45 | Passa (3:1) |
| `--color-meter-fill` (UI) | `--color-meter-track` | 6,49 | Passa (3:1) |
| `--color-status-neutral` (marcador) | `--color-surface` | 4,76 ou mais | Passa (3:1) |

Par proibido no tema claro: `--color-text-subtle` sobre `--color-surface-muted` (4,34:1); nesse
fundo use `--color-text-muted`.

### 11.2 Tema escuro

| Texto ou elemento | Fundo | Razão | Resultado |
| --- | --- | --- | --- |
| `--color-text` | `--color-surface` / `--color-bg` / `--color-surface-muted` | 17,06 / 19,28 / 13,98 | Passa |
| `--color-text-muted` | `--color-surface` / `--color-bg` / `--color-surface-muted` | 12,02 / 13,59 / 9,85 | Passa |
| `--color-text-subtle` | `--color-surface` / `--color-bg` / `--color-surface-muted` | 6,96 / 7,87 / 5,71 | Passa |
| `--color-text-on-primary` | `--color-primary` / `--color-primary-hover` | 10,93 / 14,53 | Passa |
| `--color-primary` (link) | `--color-surface` / `--color-bg` | 9,67 / 10,93 | Passa |
| `--color-primary-soft-text` | `--color-primary-soft` | 10,97 | Passa |
| `--color-success` | `--color-success-soft` / `--color-surface` | 8,55 / 10,25 | Passa |
| `--color-warning` | `--color-warning-soft` / `--color-surface` | 8,97 / 10,69 | Passa |
| `--color-danger` | `--color-danger-soft` / `--color-surface` | 5,84 / 6,45 | Passa |
| `--color-text-on-primary` | `--color-danger` / `--color-danger-hover` | 7,29 / 10,63 | Passa |
| `--color-info` | `--color-info-soft` / `--color-surface` | 6,48 / 8,33 | Passa |
| `--color-border-strong` (UI) | `--color-surface` | 6,96 | Passa (3:1) |
| `--color-focus-ring` (UI) | `--color-surface` / `--color-bg` | 6,56 / 7,41 | Passa (3:1) |
| `--color-meter-fill` (UI) | `--color-meter-track` | 7,92 | Passa (3:1) |

No tema escuro não há par proibido entre os tokens desta tabela.
