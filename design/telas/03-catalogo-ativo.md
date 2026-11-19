# Tela 03 — Catálogo: detalhe do ativo com versões

| Item | Valor |
| --- | --- |
| Rota | `/catalogo/[assetId]` (versão aberta em `?versao=N`; sem ela, a ativa ou a mais nova) |
| Título do documento | `<nome do ativo> · Catálogo · Video Studio` |
| Ticket | R1-19 (critérios 5, 6, 7) |

## Objetivo

Ver os metadados de uma versão (PRD 5.2), o histórico de versões, ativar ou descontinuar uma
versão e criar a versão N+1 ao editar.

## Wireframe — desktop (a partir de `lg`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Catálogo                                                               │
│ Mixkit Tech House  (Ativo) (Terceiros)          [Nova versão] [Ativar]   │
│ Música · mixkit-tech@2                                                   │
│                                                                          │
│ ┌──────────────────────────────────────────┐ ┌────────────────────────┐  │
│ │ Metadados                                │ │ Versões                │  │
│ │ Hash         3f9a1c0be2d4…               │ │ v2 (Ativo) (aberta)    │  │
│ │ Tamanho      4,2 MB    Tipo MIME audio/… │ │ 18/11/2026 · 4,2 MB ·  │  │
│ │ Proprietário Ricardo   Criado 18/11/2026 │ │ 3f9a1c0be2d4…          │  │
│ │ Etiquetas    trilha, tech                │ │ "volume 0,25"          │  │
│ │ Uso          1 execução                  │ │ v1 (Descontinuado)     │  │
│ ├──────────────────────────────────────────┤ │ 17/11/2026 · 4,2 MB …  │  │
│ │ Licença e procedência                    │ │            [Abrir]     │  │
│ │ Licença  Mixkit Free License · lida 17/… │ └────────────────────────┘  │
│ │ Usos     comercial, sem atribuição       │                             │
│ │ Origem   https://mixkit.co/…  autor …    │                             │
│ ├──────────────────────────────────────────┤                             │
│ │ Notas                                    │                             │
│ └──────────────────────────────────────────┘                             │
└──────────────────────────────────────────────────────────────────────────┘
```

Mobile: uma coluna; Versões vem depois de Notas.

## Estrutura

1. `PageHeader`: link "← Catálogo" (`textLinkClassName`), título = nome, `meta` = StatusBadge
   da versão aberta + StatusBadge de sensibilidade (se não for `normal`), descrição = "Tipo ·
   `assetId@version`" (ref em `mono`). Ações: Button `secondary` "Nova versão" (abre
   `/catalogo/novo?de=[assetId]` com os metadados copiados) e, conforme o status da versão
   aberta, Button `primary` "Ativar" ou Button `secondary` "Descontinuar".
2. Coluna principal (2/3 a partir de `lg`):
   - Card "Metadados": `DescriptionList` de 2 colunas — Hash (mono, completo), Tamanho, Tipo MIME
     (mono), Proprietário, Criado em, Atualizado em, Etiquetas, Uso ("N execuções"), Sensibilidade.
     Campos do tipo: `prompt` mostra a tabela de variáveis (`Table` Nome · Tipo · Padrão);
     `template` mostra Formato, FPS e Faixa de duração; `ai-model` mostra Provedor, Referência do
     modelo e Caminho local (mono). Registro por referência mostra "Armazenado por referência"
     e o caminho, nunca o conteúdo.
   - Card "Licença e procedência": `DescriptionList` — Licença, URL da licença, Lida em, Usos
     permitidos, Origem, Autor, Data de captura.
   - Card "Notas": texto da versão, ou "Sem notas nesta versão." em `caption`.
3. Coluna lateral (1/3): Card "Versões" com `VersionList` (`currentVersion` = versão aberta;
   cada linha tem link "Abrir" para `?versao=N`).

## Regras visíveis

- **Imutável**: não há edição no lugar. "Nova versão" cria N+1; a versão N não muda (critério 6).
- **Licença** (critério 7): para `sensitivity = third-party` sem licença ou procedência, "Ativar"
  fica desabilitado e um `Alert` `warning` explica: título "Licença ou procedência faltando",
  texto "Um ativo de terceiros só pode ficar ativo com licença e procedência preenchidas. Crie
  uma nova versão com esses dados." A api recusa da mesma forma; o Alert mostra a recusa se ela
  vier do servidor.
- **Biométrico**: Alert `info` "Este ativo está registrado por referência. O arquivo fica no
  caminho original e não é copiado para o catálogo."
- "Descontinuar" abre Dialog: título "Descontinuar a versão vN?", texto "Receitas e execuções
  antigas continuam usando esta versão. Novas receitas não poderão escolhê-la.", botões
  "Cancelar" e "Descontinuar".

## Textos da interface

| Lugar | Texto |
| --- | --- |
| Voltar | ← Catálogo |
| Ações | Nova versão · Ativar · Descontinuar · Ativando… · Descontinuando… |
| Cards | Metadados · Licença e procedência · Notas · Versões |
| Termos | Hash · Tamanho · Tipo MIME · Proprietário · Criado em · Atualizado em · Etiquetas · Uso · Sensibilidade · Licença · URL da licença · Lida em · Usos permitidos · Origem · Autor · Data de captura |
| Sem licença | Não informada |
| Ativado (Alert `success`) | Versão vN ativada. |
| Erro ao carregar | ErrorState "Não foi possível carregar o ativo" · "Tentar de novo" |
| Não encontrado | EmptyState "Ativo não encontrado" · "Ele pode ter sido digitado errado no endereço." · "Voltar ao catálogo" |

## Acessibilidade

- O hash completo fica no texto (não só no tooltip).
- Botão desabilitado de "Ativar" tem `aria-describedby` apontando para o Alert de licença.
- A troca de versão por `?versao=N` move o foco para o `<h1>`.

## Componentes usados

`PageHeader`, `textLinkClassName`, `StatusBadge`, `Button`, `Card`, `DescriptionList`, `Table`,
`VersionList`, `Alert`, `Dialog`, `EmptyState`, `ErrorState`.
