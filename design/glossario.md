# Glossário de termos da interface (pt-BR, es, en)

A interface do estúdio (web, menu do `apps/shell` e CLI) existe em três idiomas: português do
Brasil, espanhol e inglês. O idioma da web vem do seletor de bandeiras no topo (cookie
`vs-locale`); o menu do Mac segue a lista de idiomas do macOS.

## Regras

1. **pt-BR é a fonte.** Os textos em pt-BR continuam exatamente como estão nas telas (`telas/*.md`).
   Os catálogos em espanhol e inglês seguem este glossário e o sentido do pt-BR, não a tradução
   palavra por palavra.
2. **Espanhol** neutro latino-americano, tratando por "tú" ("Elige", "Crea"). **Inglês** dos EUA,
   frases com só a primeira letra maiúscula ("New run", não "New Run").
3. Plural: `count === 1 ? singular : plural` dentro do catálogo, nos três idiomas. `Intl.PluralRules`
   não é usado, porque em português ele trata 0 como singular.
4. Datas, horas, números e valores em dólar sempre pelo idioma ativo (`Intl`), com relógio de 24 h
   nos três idiomas. Valores: `US$ 0,00` (pt-BR), `0,00 US$` (es), `$0.00` (en).
5. Não se traduzem: dados digitados pelo dono (nomes de receita e de ativo, notas, etiquetas,
   títulos), conteúdo de vídeo, nomes de comandos (`studio doctor`), caminhos e slugs de URL
   (`/execucoes`, `?motivo=sessao-expirada`).
6. Texto gravado pelo watcher nos arquivos da execução (eventos `log`, motivos de falha, atividade do
   `now.json`) é conteúdo registrado em pt-BR. Em es e en a web reconstrói o que tem campos
   estruturados; o resto aparece como foi gravado, marcado com `lang="pt-BR"`.

## Termos

| pt-BR | es | en | Observação |
| --- | --- | --- | --- |
| Execução / Execuções | Ejecución / Ejecuciones | Run / Runs | |
| Nova execução | Nueva ejecución | New run | |
| Receita | Receta | Recipe | |
| Catálogo | Catálogo | Catalog | |
| Ativo (item do catálogo) | Activo | Asset | |
| Versão | Versión | Version | |
| Agendamento | Programación | Schedule | |
| Curadoria / Curador | Curaduría / Curador | Curation / Curator | |
| Proposta (do curador) | Propuesta | Proposal | |
| Comparação | Comparación | Comparison | |
| Métricas | Métricas | Metrics | |
| Indicadores | Indicadores | Insights | O menu em inglês dizia "Indicators" |
| Contas | Cuentas | Accounts | |
| Watcher (vigia) | Watcher | Watcher | Nome próprio |
| Estúdio | Estudio | Studio | |
| Briefing | Briefing | Brief | |
| Fila de briefings | Cola de briefings | Brief queue | |
| Etapa (`StageId`) | Etapa | Stage | |
| Passo (`StepName`) | Paso | Step | |
| Fase | Fase | Phase | |
| Plano | Plan | Plan | |
| Revisão (final) | Revisión | Review | |
| Aprovar / Rejeitar (vídeo) | Aprobar / Rechazar | Approve / Reject | |
| Aprovar / Recusar (plano, portão) | Aprobar / Rechazar | Approve / Decline | |
| Portão (de aprovação) | Punto de aprobación | Gate | |
| Aprendizado | Aprendizaje | Learning | |
| Promoção / Promover / Ativar | Promoción / Promover / Activar | Promotion / Promote / Activate | |
| Vínculo (de receita) | Vínculo | Binding | |
| Referência | Referencia | Reference | |
| Material biométrico | Material biométrico | Biometric material | |
| De terceiros | De terceros | Third party | |
| Rascunho / Ativo / Descontinuado | Borrador / Activo / Descontinuado | Draft / Active / Deprecated | |
| Descontinuar | Descontinuar | Deprecate | |
| Publicação / Publicar | Publicación / Publicar | Publication / Publish | |
| Envio (para a plataforma) | Envío | Upload | |
| Teto de gasto (por execução / do mês) | Tope de gasto (por ejecución / del mes) | Spending cap (per run / monthly) | |
| Gasto do mês | Gasto del mes | Month's spend | |
| Custo máximo / estimativa | Costo máximo / estimación | Maximum cost / estimate | |
| Modo simulado / simulado | Modo simulado / simulado | Simulated mode / simulated | |
| Disparada / Perdida / Pulada (horário) | Ejecutada / Perdida / Omitida | Fired / Missed / Skipped | |
| Coleta (de métricas) | Recolección | Collection | |
| Senha (deste Mac) | Contraseña | Passphrase | Igual a `studio passphrase` |
| Entrar / Sair | Entrar / Salir | Sign in / Sign out | |
| Verifique com `studio doctor` | Verifica con `studio doctor` | Check with `studio doctor` | O comando não muda |

## Valores iguais permitidos

Um valor em es ou en igual ao pt-BR é aceito quando é nome próprio, termo técnico ou palavra que se
escreve igual no outro idioma: EngineOS Video Creator, Watcher, YouTube, Instagram, TikTok, Claude,
ElevenLabs, Briefing (es), Slot, Hash, QA, Prompt, Skill, Template (en), CSV, URL, MIME, API,
Keychain, Status (en), Total, Cache, Loudness, Fades, Plan (es e en), FPS, BPM, LUFS, dBFS, Id,
Avatar, Checkpoint, LoRA, comandos `studio …` e cognatos do espanhol (Cancelar, Motivo, Notas,
Música, Tema, Etapa, Plataforma, Importar, Conectar, Publicar, Entrar e outros).
