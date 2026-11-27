# Componentes do estúdio

Componentes do domínio do EngineOS Video Creator (catálogo, receitas, execuções e revisão). Usam os
componentes de `componentes.md` e os tokens de `tokens.md`. Os textos fixos abaixo são os
textos da interface; o restante vem das telas.

Os enums de status espelham os contratos congelados C1 e C3 (PRD 5.2 e 7.2). `@studio/ui` não
importa `packages/shared`: a web passa os valores do contrato e o TypeScript acusa divergência
se um enum ganhar um membro.

## 1. StatusBadge

Badge com marcador para quatro famílias de status. `kind` + `status` escolhem texto e tom.

| Família (`kind`) | Valor | Texto | Tom |
| --- | --- | --- | --- |
| `asset` | `draft` / `active` / `deprecated` | Rascunho / Ativo / Descontinuado | neutral / success / neutral |
| `sensitivity` | `normal` / `biometric` / `third-party` | Normal / Biométrico / Terceiros | neutral / warning / info |
| `step` | `pending` | Pendente | neutral |
| `step` | `running` | Em execução | active, marcador pulsando |
| `step` | `ok` | Concluído | success |
| `step` | `warning` | Concluído com recuperação | warning |
| `step` | `failed` | Falhou | danger |
| `step` | `skipped` | Pulado | neutral |
| `run` | `draft` / `pending` | Rascunho / Na fila | neutral |
| `run` | `running` | Em execução | active, marcador pulsando |
| `run` | `waiting` | Aguardando você | warning |
| `run` | `paused` | Pausada | neutral |
| `run` | `failed` | Falhou | danger |
| `run` | `interrupted` | Interrompida | warning |
| `run` | `review` | Em revisão | info |
| `run` | `approved` / `rejected` | Aprovada / Rejeitada | success / danger |

O badge "Em execução" só aparece enquanto o pid do watcher está vivo (PRD 7.2); quem decide é a
api, o componente só desenha o status recebido.

## 2. AssetCard

Item do catálogo em grade. `<article>` com: tipo (`overline`), StatusBadge de status e de
sensibilidade (só se não for `normal`), título `heading-3` (o link do título cobre o card
inteiro), ref `assetId@version` em `mono` `--color-text-muted`, etiquetas (Badge neutral) e
rodapé `caption` "Usado em N execuções · Atualizado em dd/mm/aaaa".

- Card como na seção 5 de `componentes.md`; hover: borda `--color-border-strong`;
  `:focus-within`: contorno de foco no card inteiro.
- "Usado em 1 execução" no singular.

## 3. VersionList

`<ol aria-label="Versões">` da mais nova para a mais antiga. Cada linha: `v{N}` em mono
semibold, StatusBadge do ativo, "(versão aberta)" na versão exibida, linha `caption` com data ·
tamanho · hash curto (12 caracteres + "…", hash completo no `title` e para leitores de tela), nota
da versão em `body-sm` e ações à direita ("Ativar", "Descontinuar").

- Versão aberta: fundo `--color-primary-soft`, `aria-current="true"`.
- Linhas separadas por `--color-border`; contêiner com raio `--radius-md`.
- Versões são imutáveis (PRD 5.4): não há ação "Editar" na linha; editar cria a versão N+1 na
  tela de detalhe.

## 4. UploadDropzone

Área de soltar arquivos com botões para quem usa teclado.

| Parte | Valor |
| --- | --- |
| Área | altura mínima `--size-dropzone-min-height`, padding `--space-6`, borda tracejada `2px` `--color-border-strong`, raio `--radius-lg`, fundo `--color-surface` |
| Arrastando | fundo `--color-primary-soft`, borda `--color-primary`; título vira "Solte para enviar" |
| Erro | borda `--color-danger` |
| Desabilitada | fundo `--color-surface-muted`, borda `--color-text-disabled` |
| Título | "Arraste arquivos para cá" (`body-sm`, medium) |
| Dica | tipos aceitos e limite de tamanho do tipo de ativo (`caption`), ligada aos botões por `aria-describedby` |
| Botões | "Escolher arquivo" ou "Escolher arquivos" (secondary `sm`); "Escolher pasta" (ghost `sm`) quando a pasta é permitida |
| Seleção | lista dos arquivos escolhidos abaixo da área, numa região `aria-live="polite"` |

- `role="group"` com nome "Área para soltar arquivos". Os `<input type="file">` nativos ficam
  ocultos e fora do Tab; o `id` do campo aponta para eles, então o rótulo do FormField abre o
  seletor.
- Pastas: pelo botão "Escolher pasta" (`webkitdirectory`). Soltar uma pasta na área não é
  suportado em R1.
- A validação (tipos MIME permitidos por tipo de ativo, tamanho, nomes de caminho) é da web e da
  api (PRD 5.3); o componente só entrega os arquivos.

## 5. BindingList

Vínculos de uma receita (PRD 6): `<fieldset>` com legenda "Vínculos" (`heading-3`) e uma linha
por slot. Cada linha é um FormField: rótulo = nome do slot em pt-BR + id do slot em mono
`--font-size-xs` `--color-text-muted`; ajuda = "Aceita: {tipos}"; controle = Select de versões
`assetId@version` do catálogo. Uma coluna; duas a partir de `lg` (gap de coluna `--space-6`).

## 6. RunControls

Grupo "Controles da execução" com Pausar (secondary), Retomar (primary) e Parar (ghost com texto
`--color-danger`). Só aparecem os botões que o status permite:

| Status da execução | Pausar | Retomar | Parar |
| --- | --- | --- | --- |
| `pending`, `running`, `waiting` | sim | não | sim |
| `paused`, `interrupted` | não | sim | sim |
| `draft`, `failed`, `review`, `approved`, `rejected` | não | não | não |

- Enquanto a escrita em `control.json` está em andamento, o botão da ação mostra o Spinner com
  "Pausando…", "Retomando…" ou "Parando…" e os outros ficam desabilitados.
- "Parar" abre um Dialog `alertdialog`: título "Parar a execução?", texto "A execução termina
  depois do passo atual. Os arquivos já gerados continuam na pasta da execução.", botões
  "Continuar executando" (secondary) e "Parar execução" (danger).

## 7. StepTimeline

Linha do tempo de uma execução: fases → etapas → os sete passos fixos (PRD 7.2).

- Região "Linha do tempo da execução". Cada fase: título `overline` ("Pré-produção",
  "Produção", "Pós-produção", "Entrega") e uma lista de etapas num contêiner com borda.
- Etapa: `<details>` nativo (abre e fecha com Enter/Espaço). Resumo com altura mínima
  `--control-height-lg`: marcador de `--size-status-dot`, nome (medium), StatusBadge do passo e
  custo da etapa em `caption`. Abre sozinha a etapa atual e a etapa que falhou.
- Passos: lista com linha vertical `--color-timeline-line` ligando os marcadores; cada passo
  mostra marcador, nome, StatusBadge, duração e detalhe opcional ("2 tentativas, 1
  recuperação") em `caption`.
- Passo atual (`now.json`): `aria-current="step"`, semibold, fundo `--color-primary-soft`.
- Cor do marcador: neutral `--color-status-neutral`, em execução `--color-status-active`, ok
  `--color-success`, com recuperação `--color-warning`, falhou `--color-danger`. Pulado: nome
  riscado em `--color-text-muted`.

| Passo (`StepName`) | Texto |
| --- | --- |
| `brief` | Briefing |
| `preflight` | Pré-checagem |
| `snapshot` | Registro de entradas |
| `execute` | Execução |
| `verify` | Verificação |
| `archive` | Arquivamento |
| `record` | Registro |

## 8. NowPanel

Card "Agora" (`heading-3`) com StatusBadge da execução à direita; abaixo, numa região
`aria-live="polite"` `aria-atomic="true"`: "Etapa · Passo" em `--font-size-lg` semibold e a
mensagem atual em `body-sm`; depois "atualizado há N s" em `caption` (com `stale`, sem dado novo
há mais de 5 s, a linha fica em `--color-warning`) e as ações (RunControls) separadas por uma
borda superior.

## 9. EventLog

Feed de `events.jsonl`, o mais novo por último. `role="log"` com nome "Eventos", `aria-live="polite"`,
focável (rola pelo teclado), altura máxima `--layout-log-max-height`.

- Linha: hora em mono `--color-text-muted`, nível em maiúsculas `--font-size-xs` semibold
  ("Info", "Aviso", "Erro"), origem em medium + mensagem.
- Aviso: nível em `--color-warning`. Erro: nível em `--color-danger` e linha com fundo
  `--color-danger-soft`.
- Vazio: "Nenhum evento ainda."

## 10. CostMeter

Gasto contra um teto de custo (`limits.costPerRunUsd` ou o limite do mês).

- Linha de cima: rótulo (`label`) e "US$ 0,42 de US$ 5,00" em semibold com números tabulares.
- Trilho `--color-meter-track`, altura `--size-meter-height`, raio `--radius-full`;
  preenchimento `--color-meter-fill` até 80 %, `--color-warning` de 80 % a 99 %,
  `--color-danger` a partir de 100 %. Estimativa do plano como um traço vertical `2px` em
  `--color-text`, com "Estimativa do plano: US$ …" em `caption`.
- A 100 %: "Limite de custo atingido." em `--color-danger`.
- `role="meter"` com `aria-valuemin`, `aria-valuemax`, `aria-valuenow` e
  `aria-valuetext` igual ao texto visível. Valores em USD formatados em pt-BR (`formatUsd`).

## 11. WatcherIndicator

Badge com marcador na top bar, dentro de `role="status"`:

| Estado | Texto | Tom |
| --- | --- | --- |
| `running` | Watcher ativo | success |
| `stopped` | Watcher parado | danger |
| `unknown` | Watcher sem resposta | neutral |

## 12. WaitingNotice

Alert `warning` com título "Aguardando você", o motivo em um parágrafo e "**O que fazer:**"
seguido do texto escrito pelo motor para o portão; ações do portão abaixo (por exemplo
"Aprovar plano" e "Recusar plano"). Usado para toda execução em `waiting` (PRD 7.3, critério 16).

## 13. VideoPlayer

`<figure>` com `<video controls preload="metadata">` nativo (teclado e legendas vêm do
navegador), nome acessível vindo da tela, faixa `<track kind="captions" srclang="pt-BR">`
quando houver legendas, e `figcaption` em `caption` (duração, resolução, loudness).

- Moldura `--color-media-bg`, raio `--radius-lg`, proporção 16:9 ou 9:16.
- 9:16 tem altura máxima de `100vh` menos a top bar e `--space-16`, centralizado.
- Sem suporte a vídeo: "Este navegador não reproduz o vídeo." com link "Abrir o arquivo do vídeo".

## 14. RatingInput

Nota 1-5 (D14) como grupo de rádios nativo (`role="radiogroup"`, setas do teclado mudam a
escolha), legenda "Nota" (`label`).

- Cada opção: círculo de `--control-height-lg` com o número (`--font-size-lg`, semibold),
  borda `--color-border-strong`; selecionado: `--color-text-on-primary` sobre `--color-primary`;
  foco no círculo. Abaixo, o texto em `caption`.
- Textos: 1 Muito ruim · 2 Ruim · 3 Razoável · 4 Bom · 5 Excelente.
- Obrigatório (`aria-required`); erro em `--color-danger` ligado por `aria-describedby`.

## 15. Checklist

Checklist de publicação da revisão (D14: os 8 itens de `publishChecklistItems`, configuráveis
por receita).

- `<fieldset>` com legenda "Checklist de publicação" e o progresso "N de 8 itens marcados" em
  `caption` (ligado por `aria-describedby`).
- Lista com borda `--color-border` e raio `--radius-md`; cada item: checkbox `--size-icon-md`
  com `accent-color: var(--color-primary)`, texto em `body-sm`, e Badge "Obrigatório" (neutral;
  danger quando falta marcar ao tentar aprovar). Item marcado: fundo `--color-surface-muted`.
- Erro ao aprovar com obrigatório desmarcado: "Marque todos os itens obrigatórios para aprovar."
  com `role="alert"`; os itens que faltam ganham `aria-invalid="true"`.

| Item (`publishChecklistItems`) | Texto |
| --- | --- |
| `claimsVerified` | Afirmações verificadas em fontes ou em teste reproduzível |
| `toolFactsCurrent` | Nome, interface, preço e disponibilidade da ferramenta atuais na data da revisão |
| `mediaLicensesDocumented` | Licenças de mídia e direitos de voz documentados |
| `noPersonalOrConfidentialData` | Sem dados pessoais, chaves, contas de clientes ou telas confidenciais |
| `technicalSpecOk` | Especificação técnica da receita atendida (duração, formato, narração inteligível, legendas na área segura) |
| `metadataAndDisclosuresAccurate` | Miniatura, título, hashtags, afiliação e avisos de IA corretos |
| `previewWatchedFully` | Vídeo assistido do começo ao fim |
| `accountAndPermissionConfirmed` | Conta de criador, visibilidade e permissão explícita confirmadas |

Os textos acima são o padrão; uma receita pode trocar a lista (R1-15).

## 16. QaResultList

Evidência de QA da revisão: "N de M checagens passaram" em `caption` e uma lista com uma linha
por checagem: Badge com marcador (Passou success · Aviso warning · Falhou danger), nome em
medium, "Medido: … · Esperado: …" em `caption` com números tabulares, e o link para o arquivo de
evidência em `qa/` na linha de baixo.
