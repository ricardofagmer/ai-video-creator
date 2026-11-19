# Tela 04 — Catálogo: envio e registro por referência

| Item | Valor |
| --- | --- |
| Rota | `/catalogo/novo` (nova versão de um ativo: `/catalogo/novo?de=[assetId]`) |
| Título do documento | `Enviar ativo · Video Studio` (nova versão: `Nova versão · <nome> · Video Studio`) |
| Ticket | R1-19 (critérios 5, 6, 7, 22) |

## Objetivo

Enviar um arquivo ou pasta de qualquer tipo da PRD 5.1, ou registrar por referência (caminho e
hash, sem copiar os bytes), preenchendo os metadados obrigatórios da PRD 5.2. Salva como versão
1 em `draft` (ativo novo) ou como versão N+1 (nova versão).

## Wireframe — desktop

```
┌──────────────────────────────────────────────────────────────┐
│ ← Catálogo                                                   │
│ Enviar ativo                                                 │
│ O ativo é salvo como rascunho, versão 1.                     │
│                                                              │
│ ┌ Arquivo ─────────────────────────────────────────────────┐ │
│ │ Tipo de ativo   [Música                          ▾]      │ │
│ │ Como adicionar  (•) Enviar arquivo  ( ) Registrar por    │ │
│ │                                         referência       │ │
│ │ ┌ - - - - - - - - - - - - - - - - - - - - - - - - - - ┐  │ │
│ │ │        Arraste arquivos para cá                     │  │ │
│ │ │        MP3, WAV ou M4A, até 200 MB                  │  │ │
│ │ │   [Escolher arquivo]                                │  │ │
│ │ └ - - - - - - - - - - - - - - - - - - - - - - - - - - ┘  │ │
│ │ mixkit-tech-house.mp3 · 4,2 MB                           │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌ Identificação ───────────────────────────────────────────┐ │
│ │ Nome  [                     ]   Id  [mixkit-tech       ] │ │
│ │ Etiquetas (opcional) [trilha, tech]                      │ │
│ │ Sensibilidade [Terceiros ▾]                              │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌ Licença e procedência ───────────────────────────────────┐ │
│ │ …                                                        │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌ Campos do tipo ──────────────────────────────────────────┐ │
│ └──────────────────────────────────────────────────────────┘ │
│                                  [Cancelar] [Salvar rascunho]│
└──────────────────────────────────────────────────────────────┘
```

Largura máxima do formulário: `--layout-form-max-width`. Mobile: mesma ordem, campos em uma
coluna.

## Estrutura

1. `PageHeader` com "← Catálogo", título e descrição.
2. Card "Arquivo":
   - `FormField` "Tipo de ativo" com `Select` dos 9 tipos (textos da tela 02). Em nova versão, o
     tipo vem fixo (Input somente leitura).
   - `RadioGroup` `inline` "Como adicionar": "Enviar arquivo" · "Registrar por referência". Para
     `ai-model` com sensibilidade `biometric`, só "Registrar por referência" é permitido.
   - Enviar: `UploadDropzone` dentro de `FormField` "Arquivo", com `accept` e a dica do tipo;
     `allowFolder` para `skill`, `template` e `brand-kit`; arquivos escolhidos listados abaixo
     ("nome · tamanho").
   - Referência: `FormField` "Caminho no Mac" com `Input mono`; ajuda "O arquivo não é copiado.
     O catálogo guarda o caminho e o hash."
3. Card "Identificação": Nome; Id (`Input mono`, gerado do nome em minúsculas com hífens,
   editável só em ativo novo, ajuda "Letras minúsculas, números e hífens."); Etiquetas
   (opcional, separadas por vírgula); Sensibilidade (`Select`: Normal · Biométrico · Terceiros);
   Notas (opcional, `Textarea`).
4. Card "Licença e procedência": Licença (nome); URL da licença; Lida em (`Input type="date"`);
   Usos permitidos; Origem (URL ou "Criado aqui"); Autor; Data de captura. Para Normal ficam
   opcionais; para Terceiros a ajuda do card diz "Obrigatório para ativar um ativo de terceiros."
   (o salvamento em rascunho é permitido sem eles, critério 7).
5. Card "Campos do tipo" (só para os tipos com campos próprios, PRD 5.2):
   - `prompt`: tabela editável de variáveis (Nome · Tipo · Padrão) com Button `secondary` `sm`
     "Adicionar variável".
   - `template`: Formato (Largura x Altura), FPS, Duração mínima e máxima (s), esquema de entrada
     (`Textarea mono`).
   - `ai-model`: Provedor, Referência do modelo (nome da variável de ambiente ou do item do
     Keychain, nunca o segredo; ajuda "Nunca cole uma chave aqui."), Caminho local (opcional).
6. Rodapé: Button `secondary` "Cancelar" (volta sem salvar) e Button `primary` `type="submit"`
   "Salvar rascunho" (nova versão: "Salvar versão N+1"); carregando "Salvando…".

## Textos da interface

| Lugar | Texto |
| --- | --- |
| Título / descrição (novo) | Enviar ativo · O ativo é salvo como rascunho, versão 1. |
| Título / descrição (nova versão) | Nova versão de {nome} · A versão {N} continua igual; esta será a versão {N+1}. |
| Modo | Como adicionar · Enviar arquivo · Registrar por referência |
| Dropzone | Arraste arquivos para cá · Solte para enviar · Escolher arquivo · Escolher arquivos · Escolher pasta |
| Erros de arquivo | Tipo de arquivo não aceito para {tipo}. · O arquivo passa do limite de {limite}. · Escolha um arquivo. |
| Erros de campo | Preencha o nome. · Use só letras minúsculas, números e hífens. · Este id já existe no catálogo. · Informe uma URL válida. |
| Sucesso | Redireciona para `/catalogo/[assetId]?versao=N` com Alert `success` "Ativo salvo como rascunho." |
| Falha do servidor | Alert `error` no topo do formulário: "Não foi possível salvar. {mensagem da api}" |

## Estados

- Envio em andamento: botão carregando, formulário com `aria-busy="true"`, campos desabilitados.
- Erros de campo inline (`FormField error`); no envio com erro, o foco vai para o primeiro campo
  inválido.
- Sair com alterações: o navegador confirma (`beforeunload`).

## Acessibilidade

- Cada card do formulário é um `<fieldset>` com legenda igual ao título.
- A lista de arquivos escolhidos é anunciada (`aria-live="polite"` da dropzone).
- Campos obrigatórios com `aria-required`; opcionais com "(opcional)" no rótulo.

## Componentes usados

`PageHeader`, `Card`, `FormField`, `Select`, `RadioGroup`, `Input`, `Textarea`,
`UploadDropzone`, `Table`, `Button`, `Alert`.
