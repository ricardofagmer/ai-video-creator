# Tokens do design system

Paleta no estilo do ícone do Instagram: gradiente amarelo, laranja, rosa, roxo e azul-violeta
sobre branco suave (off-white neutro), com cinzas neutros. Space Grotesk nos títulos, Inter no
texto e JetBrains Mono em navegação, rótulos e código. Fontes auto-hospedadas em
`packages/ui/src/styles/fonts/`. O tema é escolhido no `ThemeToggle` (sistema, claro, escuro) e
guardado no cookie `vs-theme`, que o servidor lê para renderizar `data-theme`.

Fonte única dos valores visuais. `packages/ui/src/styles/tokens.css` transcreve cada linha para
CSS variables no seletor `:root`, com o **nome exato** da coluna "Token". Componentes e telas
usam os tokens semânticos; a escala bruta existe só para definir os semânticos.

Dois temas, claro e escuro. Cada token semântico é declarado uma vez com
`light-dark(<claro>, <escuro>)`; `color-scheme: light dark` em `:root` faz o navegador seguir o
sistema operacional, e `data-theme="light"` ou `data-theme="dark"` em `<html>` força um tema.

## 1. Cores

### 1.1 Escala de tinta (cinzas neutros)

Neutros sem matiz, para que só o gradiente carregue cor. O tema claro usa fundo e superfícies em
off-white no mesmo tom dos cinzas (seção 1.4), sem branco puro, para não ofuscar: a página fica
em torno de L* 91 e os cards um degrau mais claros; o escuro, quase preto neutro.

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-white` | `#FFFFFF` | texto sobre a primária e sobre os gradientes de controle |
| `--color-black` | `#000000` | |
| `--color-gray-50` | `#FAFAFA` | |
| `--color-gray-100` | `#F4F4F5` | |
| `--color-gray-200` | `#E4E4E7` | |
| `--color-gray-300` | `#D4D4D8` | |
| `--color-gray-400` | `#A1A1AA` | |
| `--color-gray-500` | `#71717A` | |
| `--color-gray-600` | `#52525B` | |
| `--color-gray-700` | `#3F3F46` | borda no escuro |
| `--color-gray-800` | `#27272A` | |
| `--color-gray-850` | `#1C1C1F` | superfície no escuro |
| `--color-gray-900` | `#121214` | |
| `--color-gray-950` | `#0A0A0B` | fundo no escuro |
| `--color-ink-text` | `#18181B` | texto no tema claro |
| `--color-ink-text-dark` | `#FAFAFA` | texto no tema escuro |

### 1.2 Primária (rosa-magenta) e paradas do gradiente

| Token | Valor | Uso |
| --- | --- | --- |
| `--color-primary-50` | `#FFF0F6` | |
| `--color-primary-100` | `#FFE0EC` | |
| `--color-primary-200` | `#FFC2DA` | |
| `--color-primary-300` | `#FF94BD` | |
| `--color-primary-400` | `#F5609B` | primária no escuro |
| `--color-primary-500` | `#E83E8C` | |
| `--color-primary-600` | `#D62976` | rosa do gradiente, contorno de foco no claro |
| `--color-primary-700` | `#B01F61` | |
| `--color-primary-800` | `#8C1A4E` | |
| `--color-primary-950` | `#3A0A20` | |
| `--color-yellow-300` | `#FEDA75` | início do gradiente |
| `--color-orange-400` | `#FA7E1E` | laranja do gradiente |
| `--color-orange-700` | `#C2410C` | laranja legível com texto branco |
| `--color-orange-800` | `#9A3412` | |
| `--color-purple-400` | `#C17BE0` | acento no escuro |
| `--color-purple-600` | `#962FBF` | acento no claro, roxo do gradiente |
| `--color-purple-700` | `#7A2499` | |
| `--color-blue-violet-400` | `#8B93F0` | informação no escuro |
| `--color-blue-violet-600` | `#4F5BD5` | fim do gradiente, informação no claro |

### 1.2.1 Gradientes e brilho

| Token | Uso |
| --- | --- |
| `--gradient-brand` | Decorativo, sem texto: amarelo, laranja, rosa, roxo, azul-violeta a 45°; trilho da navegação, texto `.text-gradient` |
| `--gradient-rail` | Linha sob a top bar (laranja, rosa, roxo) |
| `--gradient-control` / `--gradient-control-hover` | Fundo do botão primário, logo, opção marcada (laranja escuro, rosa, roxo); texto branco ≥ 4.5:1 em todo o gradiente |
| `--gradient-page` | Halos rosa e laranja (roxo no escuro) no fundo da página |
| `--color-surface-glass` | Top bar de vidro com `backdrop-filter` |
| `--color-border-glow` | Borda rosada de top bar, diálogo e brilho interno do card |
| `--shadow-glow` / `--shadow-float` | Brilho do botão primário e sombra da top bar flutuante |
| `--color-on-brand` | Texto sobre os gradientes de controle (branco nos dois temas) |
| `--color-accent` | Roxo para destaque pontual |

### 1.3 Semânticas de feedback (Alert, Badge, estados)

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `--color-success` | `#15803D` | `#4ADE80` | Texto e marcador de sucesso |
| `--color-success-soft` | `#DEEFE7` | `#052E16` | Fundo de Alert/Badge de sucesso |
| `--color-success-border` | `#99E5C2` | `#166534` | Borda de Alert/Badge de sucesso |
| `--color-warning` | `#AB4F09` | `#FBBF24` | Texto e marcador de aviso, "Aguardando você" |
| `--color-warning-soft` | `#EFEBDB` | `#451A03` | Fundo de aviso |
| `--color-warning-border` | `#EDD67B` | `#92400E` | Borda de aviso |
| `--color-danger` | `#B91C1C` | `#F87171` | Erro, falha, botão de perigo |
| `--color-danger-hover` | `#991B1B` | `#FCA5A5` | Hover do botão de perigo |
| `--color-danger-soft` | `#F4E8E8` | `#450A0A` | Fundo de erro |
| `--color-danger-border` | `#F4C1C1` | `#991B1B` | Borda de erro |
| `--color-info` | `#4F5BD5` | `#8B93F0` | Informação, run em revisão |
| `--color-info-soft` | `#E8EAF7` | `#14173A` | Fundo informativo |
| `--color-info-border` | `#C1C6EF` | `#2E3592` | Borda informativa |

No claro, os fundos `-soft` ficam em L* 93, entre a página e o card, para que alertas e badges
nunca pareçam mais claros que os cards; cada `-border` desce junto com o seu fundo.

### 1.4 Tokens semânticos (os componentes usam só estes e os da seção 1.3)

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `--color-bg` | `#E6E6E9` | `--color-gray-950` | Fundo da página |
| `--color-surface` | `#EFEFF2` | `--color-gray-850` | Cards, campos, diálogos |
| `--color-surface-muted` | `#E3E3E7` | `--color-gray-800` | Cabeçalho de tabela, hover, badge neutro |
| `--color-surface-glass` | `rgba(239, 239, 242, 0.8)` | `rgba(10, 10, 11, 0.62)` | Top bar de vidro |
| `--color-border` | `#D1D1D6` | `--color-gray-700` | Bordas de card e divisores (decorativos) |
| `--color-border-strong` | `--color-gray-500` | `--color-gray-500` | Borda de campo e botão secundário (≥ 3:1) |
| `--color-border-glow` | `rgba(214, 41, 118, 0.22)` | `rgba(245, 96, 155, 0.28)` | Borda rosada da top bar e do diálogo |
| `--color-text` | `--color-ink-text` | `--color-ink-text-dark` | Texto principal |
| `--color-text-muted` | `--color-gray-600` | `--color-gray-400` | Texto secundário, ajuda, legendas |
| `--color-text-subtle` | `#64646C` | `--color-gray-400` | Placeholder e legendas discretas |
| `--color-text-disabled` | `--color-gray-400` | `--color-gray-600` | Controles desabilitados (isento de contraste) |
| `--color-text-on-primary` | `--color-white` | `--color-gray-950` | Texto sobre `--color-primary` e `--color-danger` |
| `--color-on-brand` | `--color-white` | `--color-white` | Texto sobre os gradientes de controle |
| `--color-primary` | `#BC2468` | `--color-primary-400` | Links, item ativo, botão primário sem gradiente |
| `--color-primary-hover` | `--color-primary-700` | `--color-primary-300` | Hover da primária |
| `--color-primary-soft` | `#F6E7ED` | `--color-primary-950` | Fundo de item ativo, versão aberta, passo atual |
| `--color-primary-soft-text` | `--color-primary-800` | `--color-primary-200` | Texto sobre `--color-primary-soft` |
| `--color-accent` | `--color-purple-600` | `--color-purple-400` | Roxo para destaque pontual |
| `--color-focus-ring` | `--color-primary-600` | `--color-primary-400` | Contorno de foco |
| `--color-overlay` | `rgba(24, 24, 27, 0.45)` | `rgba(10, 10, 11, 0.75)` | Fundo atrás do Dialog |
| `--color-media-bg` | `--color-black` | `--color-black` | Moldura do player de vídeo |
| `--color-shadow-weak` | `rgba(24, 24, 27, 0.06)` | `rgba(0, 0, 0, 0.4)` | Cor das sombras (camada leve) |
| `--color-shadow-strong` | `rgba(24, 24, 27, 0.1)` | `rgba(0, 0, 0, 0.6)` | Cor das sombras (camada forte) |
| `--color-glow` | `rgba(214, 41, 118, 0.26)` | `rgba(214, 41, 118, 0.5)` | Brilho do botão primário e da navegação |
| `--color-glow-blue` | `rgba(214, 41, 118, 0.08)` | `rgba(214, 41, 118, 0.18)` | Halo de foco e halo rosa da página (nome mantido) |
| `--color-glow-cyan` | `rgba(250, 126, 30, 0.08)` | `rgba(150, 47, 191, 0.16)` | Halo laranja (roxo no escuro) da página (nome mantido) |
| `--color-grid-line` | `rgba(214, 41, 118, 0.04)` | `rgba(245, 96, 155, 0.05)` | Linhas da grade do fundo |

No claro, fundo, superfícies e borda são off-whites no mesmo tom levemente frio dos cinzas, sem
branco puro: a página (`#E6E6E9`, L* 91) fica um degrau mais escura que o card (`#EFEFF2`),
`--color-surface-muted` (`#E3E3E7`) fica logo abaixo da página e a borda (`#D1D1D6`) escurece
na mesma proporção, para manter as camadas sem ofuscar.
Sobre essas superfícies, `--color-text-subtle` (`#64646C`) e `--color-primary` (`#BC2468`) ficam
um tom abaixo de `--color-gray-500` e `--color-primary-600`, e `--color-warning` (`#AB4F09`) um
tom abaixo do âmbar original, para manter 4,5:1 (seção 11.1); o gradiente, a seleção e o contorno
de foco continuam em `--color-primary-600`.

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
| `--font-sans` | `"Inter", system-ui, sans-serif` | Todo o texto da interface |
| `--font-display` | `"Space Grotesk", "Inter", sans-serif` | Títulos (h1-h3, `.heading-*`, `.metric`, logo) |
| `--font-mono` | `"JetBrains Mono", ui-monospace, monospace` | Navegação, `.eyebrow`, cabeçalho de tabela, hashes e código |

| Token | Valor | Uso |
| --- | --- | --- |
| `--letter-spacing-display` | `-0.02em` | Títulos em Space Grotesk |
| `--letter-spacing-eyebrow` | `0.08em` | `.eyebrow` |
| `--letter-spacing-overline` | `0.04em` | `.overline` |
| `--letter-spacing-logo` | `-0.04em` | Monograma "VS" |

### 2.2 Escala de tamanhos

| Token | Valor | Uso |
| --- | --- | --- |
| `--font-size-xs` | `12px` | Badge, cabeçalho de tabela, overline |
| `--font-size-mono` | `13px` | Links da navegação em JetBrains Mono (como no site) |
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
| `--line-height-snug` | `1.4` |
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
| `--space-0-5` | `2px` | | |
| `--space-1` | `4px` | `--space-8` | `32px` |
| `--space-2` | `8px` | `--space-10` | `40px` |
| `--space-3` | `12px` | `--space-12` | `48px` |
| `--space-4` | `16px` | `--space-16` | `64px` |
| `--space-5` | `20px` | | |

## 4. Raios

| Token | Valor | Uso |
| --- | --- | --- |
| `--radius-xs` | `2px` | Linha de destaque da navegação |
| `--radius-sm` | `6px` | Badge, passo atual |
| `--radius-md` | `12px` | Botões, campos, Alert, tabelas, listas |
| `--radius-lg` | `20px` | Cards, Dialog, dropzone, player |
| `--radius-xl` | `24px` | Card do login, superfícies de destaque |
| `--radius-2xl` | `28px` | Trilho flutuante de navegação e cartões de destaque |
| `--radius-full` | `9999px` | Marcadores de status, Spinner, nota 1-5, trilho do CostMeter |

## 5. Sombras

A cor das sombras vem de `--color-shadow-weak` e `--color-shadow-strong`, então o tema escuro
escurece as sombras sem outro token.

| Token | Valor | Uso |
| --- | --- | --- |
| `--shadow-sm` | `0 1px 2px 0 weak, 0 1px 3px 0 strong` | Cards, top bar |
| `--shadow-md` | `0 4px 6px -1px strong, 0 2px 4px -2px weak` | Reserva |
| `--shadow-lg` | `0 10px 15px -3px strong, 0 4px 6px -4px strong` | Dialog |
| `--shadow-glow` | `0 0 30px -12px glow` | Brilho do botão primário |
| `--shadow-glow-hover` | `0 10px 28px -12px glow` | Brilho do botão primário no hover |
| `--shadow-float` | `0 18px 50px -28px strong, borda glow` | Top bar flutuante |
| `--shadow-beam` | `0 0 10px glow` | Linha de destaque da navegação |
| `--shadow-inset-glow` | `inset 0 1px 0 border-glow` | Brilho interno do card |
| `--shadow-focus-halo` | `0 0 0 6px glow-blue` | Halo de foco global |
| `--shadow-focus-halo-control` | `0 0 0 4px glow-blue` | Halo de foco dos campos |

### 5.1 Traços, vidro e grade

Bordas de 1px ficam literais nos componentes (são o traço fino padrão); traços mais grossos usam
estes tokens.

| Token | Valor | Uso |
| --- | --- | --- |
| `--stroke-thin` | `2px` | Spinner, dropzone, seta do select, marcador do CostMeter, aba ativa |
| `--stroke-accent` | `4px` | Faixa lateral do Alert |
| `--backdrop-glass` | `blur(16px) saturate(140%)` | Top bar de vidro |
| `--backdrop-overlay` | `blur(4px)` | Fundo do Dialog |
| `--size-grid-cell` | `40px` | Célula da grade do fundo |
| `--mask-solid` | `--color-black` | Parte opaca da máscara da grade |

## 6. Foco

| Token | Valor | Uso |
| --- | --- | --- |
| `--focus-ring-width` | `2px` | `outline` de foco |
| `--focus-ring-offset` | `2px` | `outline-offset` |
| `--focus-ring-offset-tight` | `1px` | `outline-offset` de checkbox e itens de checklist |

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
| `--layout-rail-width` | `104px` | Largura do trilho flutuante de navegação (desktop) |
| `--layout-rail-item-height` | `60px` | Altura mínima de um item do trilho |
| `--layout-auth-card-width` | `400px` | Card do login |
| `--layout-form-max-width` | `720px` | Formulários de envio e editor de receita |
| `--layout-gutter-mobile` | `16px` | Margem lateral abaixo de `md` |
| `--layout-gutter-desktop` | `24px` | Margem lateral a partir de `md` |
| `--layout-log-max-height` | `360px` | Altura máxima do EventLog (rola por dentro) |
| `--layout-dialog-width` | `480px` | Largura máxima do Dialog |
| `--control-height-xs` | `28px` | Opções do ThemeToggle |
| `--control-height-sm` | `32px` | Botão `sm` |
| `--control-height-md` | `40px` | Botão e campo padrão; alvo de toque mínimo |
| `--control-height-lg` | `48px` | Botão `lg`, nota 1-5, linha de etapa |
| `--size-icon-sm` | `16px` | Spinner pequeno |
| `--size-icon-md` | `20px` | Spinner, checkbox |
| `--size-status-dot` | `10px` | Marcador de status (badge, linha do tempo) |
| `--size-logo` | `32px` | Monograma "VS" |
| `--size-meter-height` | `8px` | Altura do trilho do CostMeter |
| `--size-dropzone-min-height` | `160px` | Altura mínima da área de soltar arquivos |
| `--size-beam-offset` | `6px` | Distância da linha de destaque até a base do link |
| `--size-diff-max-height` | `512px` | Altura máxima do diff de curadoria (rola por dentro) |

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
| `--ease-standard` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Transições de estado |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Entradas |
| `--lift-hover` | `-1px` | Elevação do botão primário no hover |

Com `prefers-reduced-motion: reduce`: transições instantâneas, Alert e Dialog sem animação de
entrada, pulso "Em execução" parado (o texto já diz o estado), Spinner com volta de
`--duration-spin` × 2 (a rotação comunica carregamento e não é removida).

## 11. Contraste (WCAG 2.1 AA)

Razões calculadas pela fórmula de luminância relativa da WCAG 2.1 em 2026-11-22, para a paleta
rosa sobre off-white (claro) e quase preto (escuro). Mínimos: **4,5:1** para texto normal; **3:1**
para texto grande e elementos de UI.
Desabilitados são isentos (WCAG 1.4.3). `--color-border` é decorativo e fica fora da regra de 3:1.

### 11.1 Tema claro

| Texto ou elemento | Fundo | Razão | Resultado |
| --- | --- | --- | --- |
| `--color-text` | `--color-surface` / `--color-bg` / `--color-surface-muted` | 15,44 / 14,22 / 13,84 | Passa |
| `--color-text` | cada `-soft` (`primary`, `success`, `warning`, `danger`, `info`), pior caso | 14,80 | Passa |
| `--color-text-muted` | `--color-surface` / `--color-bg` / `--color-surface-muted` | 6,74 / 6,21 / 6,04 | Passa |
| `--color-text-muted` | cada `-soft` (`primary`, `success`, `warning`, `danger`, `info`), pior caso | 6,46 | Passa |
| `--color-text-subtle` | `--color-surface` / `--color-bg` / `--color-surface-muted` | 5,11 / 4,71 / 4,58 | Passa |
| `--color-text-on-primary` | `--color-primary` / `--color-primary-hover` | 5,85 / 6,53 | Passa |
| `--color-on-brand` | `--gradient-control` (laranja 700 / rosa 600 / roxo 600) | 5,18 / 4,73 / 6,08 | Passa |
| `--color-primary` (link) | `--color-surface` / `--color-bg` / `--color-surface-muted` | 5,10 / 4,70 / 4,57 | Passa |
| `--color-primary` (link) | cada `-soft` (`primary`, `success`, `warning`, `danger`, `info`), pior caso | 4,89 | Passa |
| `--color-accent` | `--color-surface` / `--color-bg` | 5,30 / 4,88 | Passa |
| `--color-primary-soft-text` | `--color-primary-soft` | 7,41 | Passa |
| `--color-success` | `--color-success-soft` / `--color-surface` | 4,60 / 4,78 | Passa |
| `--color-warning` | `--color-warning-soft` / `--color-surface` | 4,56 / 4,75 | Passa |
| `--color-danger` | `--color-danger-soft` / `--color-surface` | 5,41 / 5,64 | Passa |
| `--color-text-on-primary` | `--color-danger` / `--color-danger-hover` | 6,47 / 8,31 | Passa |
| `--color-info` | `--color-info-soft` / `--color-surface` | 4,63 / 4,83 | Passa |
| `--color-border-strong` (UI) | `--color-surface` / `--color-surface-muted` | 4,21 / 3,78 | Passa (3:1) |
| `--color-border-strong` (UI) | cada `-soft` (`primary`, `success`, `warning`, `danger`, `info`), pior caso | 4,04 | Passa (3:1) |
| `--color-focus-ring` (UI) | `--color-surface` / `--color-bg` | 4,12 / 3,80 | Passa (3:1) |
| `--color-focus-ring` (UI) | cada `-soft` (`primary`, `success`, `warning`, `danger`, `info`), pior caso | 3,95 | Passa (3:1) |
| `--color-meter-fill` (UI) | `--color-meter-track` | 4,57 | Passa (3:1) |
| `--color-status-neutral` (marcador) | `--color-surface` | 6,74 | Passa (3:1) |

No tema claro não há par proibido entre os tokens desta tabela. Fora dela, `--color-warning` como
texto direto sobre `--color-bg` fica em 4,37:1 (e 4,26:1 sobre `--color-surface-muted`); use-o
só sobre `--color-surface` ou `--color-warning-soft`, como hoje. O `--gradient-brand` (com amarelo
e laranja claros) é só decorativo e nunca leva texto pequeno.

### 11.2 Tema escuro

| Texto ou elemento | Fundo | Razão | Resultado |
| --- | --- | --- | --- |
| `--color-text` | `--color-surface` / `--color-bg` / `--color-surface-muted` | 16,29 / 18,96 / 14,27 | Passa |
| `--color-text-muted` | `--color-surface` / `--color-bg` / `--color-surface-muted` | 6,63 / 7,72 / 5,81 | Passa |
| `--color-text-subtle` | `--color-surface` / `--color-bg` / `--color-surface-muted` | 6,63 / 7,72 / 5,81 | Passa |
| `--color-text-on-primary` | `--color-primary` / `--color-primary-hover` | 6,62 / 9,63 | Passa |
| `--color-primary` (link) | `--color-surface` / `--color-bg` | 5,69 / 6,62 | Passa |
| `--color-accent` | `--color-surface` / `--color-bg` | 5,81 / 6,76 | Passa |
| `--color-primary-soft-text` | `--color-primary-soft` | 11,24 | Passa |
| `--color-success` | `--color-success-soft` / `--color-surface` | 8,67 / 8,84 | Passa |
| `--color-warning` | `--color-warning-soft` / `--color-surface` | 10,29 / 10,18 | Passa |
| `--color-danger` | `--color-danger-soft` / `--color-surface` | 6,61 / 6,15 | Passa |
| `--color-text-on-primary` | `--color-danger` / `--color-danger-hover` | 7,15 / 10,43 | Passa |
| `--color-info` | `--color-info-soft` / `--color-surface` | 6,21 / 6,10 | Passa |
| `--color-border-strong` (UI) | `--color-surface` | 3,52 | Passa (3:1) |
| `--color-focus-ring` (UI) | `--color-surface` / `--color-bg` | 5,69 / 6,62 | Passa (3:1) |
| `--color-meter-fill` (UI) | `--color-meter-track` | 4,99 | Passa (3:1) |

No tema escuro não há par proibido entre os tokens desta tabela.
