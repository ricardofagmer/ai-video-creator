import type { Messages } from '../message-types.js';

type CheckStatus = 'ok' | 'warning' | 'failed';
type DownReason = 'refused' | 'timeout' | 'error';
type ModelRejectionReason = 'missing' | 'size' | 'hash';
type ManifestInvalidReason = 'unreadable' | 'too-large' | 'invalid-json' | 'schema-mismatch' | 'unpinned';
type EmbedScope = 'unindexed' | 'stale' | 'all';

/** `studio doctor` lines, the search model and index checks and `studio models`. */
export const doctorPtBR = {
  /** Fixed-width marks, so the labels line up. */
  marks: { ok: '[ok]   ', warning: '[aviso]', failed: '[falha]' } satisfies Record<CheckStatus, string>,
  warningPrefix: '[aviso]',
  heading: (root: string) => `Diagnóstico do studio (dados em ${root})`,
  keyVariables: (names: string) => `[aviso] chaves vindas de variáveis de ambiente: ${names}.`,
  resultFailed: 'Resultado: há falhas.',
  resultOk: 'Resultado: tudo certo.',
  notChecked: (detail: string) => `não verificado: ${detail}`,
  labels: {
    database: 'banco de dados',
    storage: 'armazenamento',
    references: 'referências',
    rebuild: 'reconstrução do índice',
    costIndex: 'custos e índice',
    curations: 'curadorias',
    schedules: 'agendamentos',
    model: 'modelo de busca',
    index: 'índice de busca',
  },
  services: {
    down: {
      refused: 'nada responde',
      timeout: 'sem resposta no prazo',
      error: 'erro de conexão',
    } satisfies Record<DownReason, string>,
    startedByStudio: (pid: number) => ` (pid ${pid}, iniciado pelo studio)`,
    foreignRecord: (pid: number) => ` (registro aponta para o pid ${pid}, que não é do studio)`,
    downDetail: (url: string, reason: string, note: string, service: string) => `${url}: ${reason}${note}; use "studio start ${service}".`,
    notStudioApi: (url: string, status: number, note: string) => `${url} respondeu HTTP ${status}, mas não como a api do studio${note}.`,
    degraded: (url: string, databaseOk: boolean, note: string) =>
      `${url} responde, mas o banco está ${databaseOk ? 'ok' : 'indisponível'}${note}.`,
    healthy: (url: string, note: string) => `${url} saudável${note}.`,
    webError: (url: string, status: number, note: string) => `${url} respondeu HTTP ${status}${note}.`,
    webUp: (url: string, status: number, note: string) => `${url} responde (HTTP ${status})${note}.`,
    watcherRunning: (pid: number) => `agente launchd ativo (pid ${pid}).`,
    watcherLoaded: 'agente launchd carregado, mas sem processo no momento.',
    watcherNotLoaded: 'agente launchd não carregado; rode a instalação de novo.',
    watcherUnknown: 'não foi possível consultar o launchctl.',
    toolVersion: (version: string) => `versão ${version}.`,
    toolVersionUnknown: 'desconhecida',
    toolMissing: 'não encontrado no PATH; instale com "brew install ffmpeg".',
    toolFailed: 'encontrado, mas falhou ao informar a versão.',
    bundledToolVersion: (version: string) => `versão ${version}, incluída no app.`,
    bundledToolMissing: 'o programa incluído no app não foi encontrado ou não executa; reinstale o app.',
    runningNode: (version: string) => `versão ${version}, a mesma que executa o studio.`,
  },
  data: {
    databaseOk: (file: string) => `${file} responde.`,
    storageSize: (size: string, files: number) => `${size} em ${files} arquivo(s)`,
    storageTruncated: (size: string) => `pelo menos ${size}; a contagem parou no limite.`,
    referencesOk: 'todas as referências estão acessíveis.',
    biometricReference: 'referência biométrica (caminho não exibido)',
    andMore: (count: number) => `        ... e mais ${count}.`,
    unreachable: (count: number) => `${count} referência(s) inacessível(is); execuções que as usam param no preflight.`,
    costSummary: (runs: number, curations: number, inserted: number) =>
      `${runs} execução(ões) e ${curations} curadoria(s) indexada(s), ${inserted} lançamento(s) de custo novo(s)`,
    withProblems: (summary: string, count: number, ids: string) => `${summary}; ${count} com problema (${ids}).`,
    reindexed: (count: number) => `${count} execução(ões) reindexada(s)`,
    unreadableFolders: (count: number) => `${count} pasta(s) ilegível(is)`,
    orphanedRows: (count: number) => `${count} linha(s) sem pasta (mantidas)`,
  },
  curations: {
    ok: (days: number) => `nenhuma falhou antes de chamar o modelo nos últimos ${days} dias.`,
    failed: (count: number, days: number) =>
      `${count} terminou(aram) com falha antes de chamar o modelo nos últimos ${days} dias; peça de novo se ainda quiser a proposta`,
    unreadable: (count: number) => `${count} pasta(s) ilegível(is)`,
  },
  schedules: {
    scheduleUnreadable: 'agendamento ilegível',
    slotsUnreadable: 'registro de horários ilegível',
    firedWithoutFolder: (runId: string) => `execução disparada ${runId} sem pasta`,
    unreadableFiles: (count: number) => `${count} arquivo(s) ilegível(is); o watcher pula esse(s) agendamento(s)`,
    missingRuns: (count: number) => `${count} execução(ões) disparada(s) sem pasta em runs/`,
    watcherStopped: (count: number) => `${count} ativo(s), mas o watcher não está rodando: os horários serão perdidos`,
    ok: (active: number, paused: number) => `${active} ativo(s), ${paused} pausado(s); arquivos legíveis e execuções disparadas presentes.`,
  },
  search: {
    noModelRef: 'sem modelRef',
    absentUnpinned:
      'ausente; o manifesto em scripts/models ainda é provisório, então nada foi baixado. A busca por significado fica indisponível; o resto do studio funciona.',
    absentInvalid: 'ausente; o manifesto em scripts/models não pode ser usado (veja "studio models status").',
    absentPinned: (modelRef: string) => `ausente (${modelRef}); rode "studio models fetch" quando a rede estiver disponível.`,
    ready: (modelRef: string) => `pronto (${modelRef}).`,
    rejected: (modelRef: string) =>
      `recusado (${modelRef}): os arquivos não conferem com o manifesto ou o runtime não os carregou. Rode "studio models verify" e depois "studio models fetch".`,
    counts: (indexed: number, pending: number, stale: number) => `${indexed} indexada(s), ${pending} pendente(s), ${stale} desatualizada(s)`,
    embedHint: 'rode "studio catalog embed" (ou --stale) para indexar.',
    waitHint: 'a indexação espera o modelo de busca ficar pronto.',
  },
  models: {
    manifest: (text: string) => `Manifesto: ${text}.`,
    pinned: (modelRef: string, files: number, dimensions: number) => `fixado (${modelRef}, ${files} arquivo(s), ${dimensions} dimensões)`,
    unpinned: (modelRef: string) =>
      `provisório (${modelRef}): os valores de sha-256 e tamanho ainda não foram fixados em scripts/models; nada é baixado`,
    invalid: (reason: string) => `inválido: o manifesto ${reason}`,
    invalidReasons: {
      unreadable: 'não pôde ser lido',
      'too-large': 'é grande demais',
      'invalid-json': 'não é um JSON válido',
      'schema-mismatch': 'não segue o formato esperado',
      unpinned: 'ainda tem valores provisórios',
    } satisfies Record<ManifestInvalidReason, string>,
    rejections: {
      missing: 'falta o arquivo ou ele não é um arquivo comum dentro da pasta do modelo',
      size: 'o tamanho não confere com o manifesto',
      hash: 'o sha-256 não confere com o manifesto',
    } satisfies Record<ModelRejectionReason, string>,
    verified: (modelRef: string) => `${modelRef} confere com o manifesto (tamanho e sha-256 de cada arquivo).`,
    absent: (modelRef: string) => `ausente (${modelRef}); rode "studio models fetch" ou coloque os arquivos à mão e verifique de novo.`,
    modelFolder: 'a pasta do modelo',
    rejected: (modelRef: string, file: string, reason: string) =>
      `recusado (${modelRef}): ${file}: ${reason}. Nada é carregado nem baixado; "studio models fetch" substitui os arquivos que não conferem.`,
    fetchUnpinned:
      'o manifesto do modelo de busca ainda tem valores provisórios; nada foi baixado e a busca por significado fica indisponível. O resto do studio funciona.',
    fetchFailed:
      'o modelo de busca não foi instalado (download, pasta ou conferência falhou); a busca por significado fica indisponível. Tente "studio models fetch" de novo quando a rede estiver disponível.',
    fetchInvalidSource:
      'o manifesto ou a fonte do modelo em scripts/models não puderam ser validados (ou o @studio/shared não foi construído); nada foi baixado.',
    fetchNotStarted: 'não foi possível executar /bin/bash para baixar o modelo; nada foi baixado.',
    fetchOther: (exitCode: number | null) => `o script do modelo de busca saiu com código ${exitCode ?? 'desconhecido'}; nada foi confirmado.`,
    manifestChanged: (text: string) => `[aviso] o manifesto mudou durante o download: ${text}.`,
  },
  embed: {
    scopes: {
      unindexed: 'versões não indexadas',
      stale: 'versões com vetor de outro modelo (--stale)',
      all: 'todas as versões (--all)',
    } satisfies Record<EmbedScope, string>,
    nothingIndexed: 'Nada foi indexado; as versões continuam pendentes e a busca por palavras segue funcionando.',
    unknownModel: 'modelo desconhecido',
    heading: (scope: string, modelRef: string, duration: string) => `Indexação (${scope}) com ${modelRef} em ${duration}:`,
    embedded: (count: number) => `  versões indexadas agora: ${count}`,
    failed: (count: number) => `  versões sem documento (continuam pendentes; veja logs/cli.log): ${count}`,
  },
} as const;

export type DoctorMessages = Messages<typeof doctorPtBR>;

export const doctorEs: DoctorMessages = {
  marks: { ok: '[ok]   ', warning: '[aviso]', failed: '[fallo]' },
  warningPrefix: '[aviso]',
  heading: (root) => `Diagnóstico del studio (datos en ${root})`,
  keyVariables: (names) => `[aviso] claves que vienen de variables de entorno: ${names}.`,
  resultFailed: 'Resultado: hay fallos.',
  resultOk: 'Resultado: todo en orden.',
  notChecked: (detail) => `no verificado: ${detail}`,
  labels: {
    database: 'base de datos',
    storage: 'almacenamiento',
    references: 'referencias',
    rebuild: 'reconstrucción del índice',
    costIndex: 'costos e índice',
    curations: 'curadurías',
    schedules: 'programaciones',
    model: 'modelo de búsqueda',
    index: 'índice de búsqueda',
  },
  services: {
    down: { refused: 'nada responde', timeout: 'sin respuesta a tiempo', error: 'error de conexión' },
    startedByStudio: (pid) => ` (pid ${pid}, iniciado por el studio)`,
    foreignRecord: (pid) => ` (el registro apunta al pid ${pid}, que no es del studio)`,
    downDetail: (url, reason, note, service) => `${url}: ${reason}${note}; usa "studio start ${service}".`,
    notStudioApi: (url, status, note) => `${url} respondió HTTP ${status}, pero no como la api del studio${note}.`,
    degraded: (url, databaseOk, note) => `${url} responde, pero la base de datos está ${databaseOk ? 'ok' : 'no disponible'}${note}.`,
    healthy: (url, note) => `${url} en buen estado${note}.`,
    webError: (url, status, note) => `${url} respondió HTTP ${status}${note}.`,
    webUp: (url, status, note) => `${url} responde (HTTP ${status})${note}.`,
    watcherRunning: (pid) => `agente launchd activo (pid ${pid}).`,
    watcherLoaded: 'agente launchd cargado, pero sin proceso en este momento.',
    watcherNotLoaded: 'agente launchd no cargado; ejecuta la instalación de nuevo.',
    watcherUnknown: 'no fue posible consultar launchctl.',
    toolVersion: (version) => `versión ${version}.`,
    toolVersionUnknown: 'desconocida',
    toolMissing: 'no se encontró en el PATH; instálalo con "brew install ffmpeg".',
    toolFailed: 'encontrado, pero falló al informar la versión.',
    bundledToolVersion: (version) => `versión ${version}, incluida en la app.`,
    bundledToolMissing: 'no se encontró el programa incluido en la app o no se ejecuta; reinstala la app.',
    runningNode: (version) => `versión ${version}, la misma que ejecuta el studio.`,
  },
  data: {
    databaseOk: (file) => `${file} responde.`,
    storageSize: (size, files) => `${size} en ${files} ${files === 1 ? 'archivo' : 'archivos'}`,
    storageTruncated: (size) => `al menos ${size}; el conteo se detuvo en el límite.`,
    referencesOk: 'todas las referencias son accesibles.',
    biometricReference: 'referencia biométrica (ruta no mostrada)',
    andMore: (count) => `        ... y ${count} más.`,
    unreachable: (count) =>
      count === 1
        ? '1 referencia inaccesible; las ejecuciones que la usan se detienen en la comprobación previa.'
        : `${count} referencias inaccesibles; las ejecuciones que las usan se detienen en la comprobación previa.`,
    costSummary: (runs, curations, inserted) =>
      `${runs} ${runs === 1 ? 'ejecución' : 'ejecuciones'} y ${curations} ${curations === 1 ? 'curaduría indexadas' : 'curadurías indexadas'}, ` +
      `${inserted} ${inserted === 1 ? 'asiento de costo nuevo' : 'asientos de costo nuevos'}`,
    withProblems: (summary, count, ids) => `${summary}; ${count} con problemas (${ids}).`,
    reindexed: (count) => (count === 1 ? '1 ejecución reindexada' : `${count} ejecuciones reindexadas`),
    unreadableFolders: (count) => (count === 1 ? '1 carpeta ilegible' : `${count} carpetas ilegibles`),
    orphanedRows: (count) => (count === 1 ? '1 fila sin carpeta (se mantiene)' : `${count} filas sin carpeta (se mantienen)`),
  },
  curations: {
    ok: (days) => `ninguna falló antes de llamar al modelo en los últimos ${days} días.`,
    failed: (count, days) =>
      `${count} ${count === 1 ? 'terminó' : 'terminaron'} con fallo antes de llamar al modelo en los últimos ${days} días; pide de nuevo si todavía quieres la propuesta`,
    unreadable: (count) => (count === 1 ? '1 carpeta ilegible' : `${count} carpetas ilegibles`),
  },
  schedules: {
    scheduleUnreadable: 'programación ilegible',
    slotsUnreadable: 'registro de horarios ilegible',
    firedWithoutFolder: (runId) => `ejecución lanzada ${runId} sin carpeta`,
    unreadableFiles: (count) =>
      count === 1
        ? '1 archivo ilegible; el watcher omite esa programación'
        : `${count} archivos ilegibles; el watcher omite esas programaciones`,
    missingRuns: (count) => (count === 1 ? '1 ejecución lanzada sin carpeta en runs/' : `${count} ejecuciones lanzadas sin carpeta en runs/`),
    watcherStopped: (count) =>
      `${count} ${count === 1 ? 'activa' : 'activas'}, pero el watcher no está en ejecución: se perderán los horarios`,
    ok: (active, paused) =>
      `${active} ${active === 1 ? 'activa' : 'activas'}, ${paused} ${paused === 1 ? 'pausada' : 'pausadas'}; archivos legibles y ejecuciones lanzadas presentes.`,
  },
  search: {
    noModelRef: 'sin modelRef',
    absentUnpinned:
      'ausente; el manifiesto en scripts/models todavía es provisional, así que no se descargó nada. La búsqueda por significado queda no disponible; el resto del studio funciona.',
    absentInvalid: 'ausente; el manifiesto en scripts/models no se puede usar (revisa "studio models status").',
    absentPinned: (modelRef) => `ausente (${modelRef}); ejecuta "studio models fetch" cuando la red esté disponible.`,
    ready: (modelRef) => `listo (${modelRef}).`,
    rejected: (modelRef) =>
      `rechazado (${modelRef}): los archivos no coinciden con el manifiesto o el runtime no los cargó. Ejecuta "studio models verify" y luego "studio models fetch".`,
    counts: (indexed, pending, stale) => `${indexed} indexadas, ${pending} pendientes, ${stale} desactualizadas`,
    embedHint: 'ejecuta "studio catalog embed" (o --stale) para indexar.',
    waitHint: 'la indexación espera a que el modelo de búsqueda esté listo.',
  },
  models: {
    manifest: (text) => `Manifiesto: ${text}.`,
    pinned: (modelRef, files, dimensions) => `fijado (${modelRef}, ${files} ${files === 1 ? 'archivo' : 'archivos'}, ${dimensions} dimensiones)`,
    unpinned: (modelRef) =>
      `provisional (${modelRef}): los valores de sha-256 y tamaño todavía no se fijaron en scripts/models; no se descarga nada`,
    invalid: (reason) => `no válido: el manifiesto ${reason}`,
    invalidReasons: {
      unreadable: 'no se pudo leer',
      'too-large': 'es demasiado grande',
      'invalid-json': 'no es un JSON válido',
      'schema-mismatch': 'no sigue el formato esperado',
      unpinned: 'todavía tiene valores provisionales',
    },
    rejections: {
      missing: 'falta el archivo o no es un archivo común dentro de la carpeta del modelo',
      size: 'el tamaño no coincide con el manifiesto',
      hash: 'el sha-256 no coincide con el manifiesto',
    },
    verified: (modelRef) => `${modelRef} coincide con el manifiesto (tamaño y sha-256 de cada archivo).`,
    absent: (modelRef) => `ausente (${modelRef}); ejecuta "studio models fetch" o coloca los archivos a mano y verifica de nuevo.`,
    modelFolder: 'la carpeta del modelo',
    rejected: (modelRef, file, reason) =>
      `rechazado (${modelRef}): ${file}: ${reason}. No se carga ni se descarga nada; "studio models fetch" reemplaza los archivos que no coinciden.`,
    fetchUnpinned:
      'el manifiesto del modelo de búsqueda todavía tiene valores provisionales; no se descargó nada y la búsqueda por significado queda no disponible. El resto del studio funciona.',
    fetchFailed:
      'el modelo de búsqueda no se instaló (falló la descarga, la carpeta o la verificación); la búsqueda por significado queda no disponible. Intenta "studio models fetch" de nuevo cuando la red esté disponible.',
    fetchInvalidSource:
      'no se pudieron validar el manifiesto o la fuente del modelo en scripts/models (o @studio/shared no se compiló); no se descargó nada.',
    fetchNotStarted: 'no fue posible ejecutar /bin/bash para descargar el modelo; no se descargó nada.',
    fetchOther: (exitCode) => `el script del modelo de búsqueda salió con código ${exitCode ?? 'desconocido'}; no se confirmó nada.`,
    manifestChanged: (text) => `[aviso] el manifiesto cambió durante la descarga: ${text}.`,
  },
  embed: {
    scopes: {
      unindexed: 'versiones no indexadas',
      stale: 'versiones con vector de otro modelo (--stale)',
      all: 'todas las versiones (--all)',
    },
    nothingIndexed: 'No se indexó nada; las versiones siguen pendientes y la búsqueda por palabras sigue funcionando.',
    unknownModel: 'modelo desconocido',
    heading: (scope, modelRef, duration) => `Indexación (${scope}) con ${modelRef} en ${duration}:`,
    embedded: (count) => `  versiones indexadas ahora: ${count}`,
    failed: (count) => `  versiones sin documento (siguen pendientes; revisa logs/cli.log): ${count}`,
  },
};

export const doctorEn: DoctorMessages = {
  marks: { ok: '[ok]     ', warning: '[warning]', failed: '[failed] ' },
  warningPrefix: '[warning]',
  heading: (root) => `Studio check-up (data in ${root})`,
  keyVariables: (names) => `[warning] keys coming from environment variables: ${names}.`,
  resultFailed: 'Result: there are failures.',
  resultOk: 'Result: all good.',
  notChecked: (detail) => `not checked: ${detail}`,
  labels: {
    database: 'database',
    storage: 'storage',
    references: 'references',
    rebuild: 'index rebuild',
    costIndex: 'costs and index',
    curations: 'curations',
    schedules: 'schedules',
    model: 'search model',
    index: 'search index',
  },
  services: {
    down: { refused: 'nothing answers', timeout: 'no answer in time', error: 'connection error' },
    startedByStudio: (pid) => ` (pid ${pid}, started by the studio)`,
    foreignRecord: (pid) => ` (the record points to pid ${pid}, which is not the studio's)`,
    downDetail: (url, reason, note, service) => `${url}: ${reason}${note}; use "studio start ${service}".`,
    notStudioApi: (url, status, note) => `${url} answered HTTP ${status}, but not as the studio api${note}.`,
    degraded: (url, databaseOk, note) => `${url} answers, but the database is ${databaseOk ? 'ok' : 'unavailable'}${note}.`,
    healthy: (url, note) => `${url} healthy${note}.`,
    webError: (url, status, note) => `${url} answered HTTP ${status}${note}.`,
    webUp: (url, status, note) => `${url} answers (HTTP ${status})${note}.`,
    watcherRunning: (pid) => `launchd agent active (pid ${pid}).`,
    watcherLoaded: 'launchd agent loaded, but with no process right now.',
    watcherNotLoaded: 'launchd agent not loaded; run the installer again.',
    watcherUnknown: 'could not query launchctl.',
    toolVersion: (version) => `version ${version}.`,
    toolVersionUnknown: 'unknown',
    toolMissing: 'not found on the PATH; install it with "brew install ffmpeg".',
    toolFailed: 'found, but it failed to report its version.',
    bundledToolVersion: (version) => `version ${version}, bundled with the app.`,
    bundledToolMissing: 'the program bundled with the app was not found or does not run; reinstall the app.',
    runningNode: (version) => `version ${version}, the one running the studio.`,
  },
  data: {
    databaseOk: (file) => `${file} answers.`,
    storageSize: (size, files) => `${size} in ${files} ${files === 1 ? 'file' : 'files'}`,
    storageTruncated: (size) => `at least ${size}; the count stopped at the limit.`,
    referencesOk: 'every reference is reachable.',
    biometricReference: 'biometric reference (path not shown)',
    andMore: (count) => `        ... and ${count} more.`,
    unreachable: (count) =>
      count === 1
        ? '1 unreachable reference; runs that use it stop at the preflight check.'
        : `${count} unreachable references; runs that use them stop at the preflight check.`,
    costSummary: (runs, curations, inserted) =>
      `${runs} ${runs === 1 ? 'run' : 'runs'} and ${curations} ${curations === 1 ? 'curation' : 'curations'} indexed, ` +
      `${inserted} new cost ${inserted === 1 ? 'entry' : 'entries'}`,
    withProblems: (summary, count, ids) => `${summary}; ${count} with problems (${ids}).`,
    reindexed: (count) => (count === 1 ? '1 run reindexed' : `${count} runs reindexed`),
    unreadableFolders: (count) => (count === 1 ? '1 unreadable folder' : `${count} unreadable folders`),
    orphanedRows: (count) => (count === 1 ? '1 row without a folder (kept)' : `${count} rows without a folder (kept)`),
  },
  curations: {
    ok: (days) => `none failed before calling the model in the last ${days} days.`,
    failed: (count, days) => `${count} ended with a failure before calling the model in the last ${days} days; ask again if you still want the proposal`,
    unreadable: (count) => (count === 1 ? '1 unreadable folder' : `${count} unreadable folders`),
  },
  schedules: {
    scheduleUnreadable: 'unreadable schedule',
    slotsUnreadable: 'unreadable slot log',
    firedWithoutFolder: (runId) => `fired run ${runId} has no folder`,
    unreadableFiles: (count) =>
      count === 1 ? '1 unreadable file; the watcher skips that schedule' : `${count} unreadable files; the watcher skips those schedules`,
    missingRuns: (count) => (count === 1 ? '1 fired run without a folder in runs/' : `${count} fired runs without a folder in runs/`),
    watcherStopped: (count) => `${count} active, but the watcher is not running: the slots will be missed`,
    ok: (active, paused) => `${active} active, ${paused} paused; files readable and fired runs present.`,
  },
  search: {
    noModelRef: 'no modelRef',
    absentUnpinned:
      'missing; the manifest in scripts/models is still provisional, so nothing was downloaded. Search by meaning is unavailable; the rest of the studio works.',
    absentInvalid: 'missing; the manifest in scripts/models cannot be used (see "studio models status").',
    absentPinned: (modelRef) => `missing (${modelRef}); run "studio models fetch" when the network is available.`,
    ready: (modelRef) => `ready (${modelRef}).`,
    rejected: (modelRef) =>
      `rejected (${modelRef}): the files do not match the manifest or the runtime did not load them. Run "studio models verify" and then "studio models fetch".`,
    counts: (indexed, pending, stale) => `${indexed} indexed, ${pending} pending, ${stale} stale`,
    embedHint: 'run "studio catalog embed" (or --stale) to index.',
    waitHint: 'indexing waits for the search model to be ready.',
  },
  models: {
    manifest: (text) => `Manifest: ${text}.`,
    pinned: (modelRef, files, dimensions) => `pinned (${modelRef}, ${files} ${files === 1 ? 'file' : 'files'}, ${dimensions} dimensions)`,
    unpinned: (modelRef) => `provisional (${modelRef}): the sha-256 and size values are not pinned in scripts/models yet; nothing is downloaded`,
    invalid: (reason) => `invalid: the manifest ${reason}`,
    invalidReasons: {
      unreadable: 'could not be read',
      'too-large': 'is too large',
      'invalid-json': 'is not valid JSON',
      'schema-mismatch': 'does not follow the expected format',
      unpinned: 'still has provisional values',
    },
    rejections: {
      missing: 'the file is missing or is not a regular file inside the model folder',
      size: 'the size does not match the manifest',
      hash: 'the sha-256 does not match the manifest',
    },
    verified: (modelRef) => `${modelRef} matches the manifest (size and sha-256 of each file).`,
    absent: (modelRef) => `missing (${modelRef}); run "studio models fetch" or place the files by hand and verify again.`,
    modelFolder: 'the model folder',
    rejected: (modelRef, file, reason) =>
      `rejected (${modelRef}): ${file}: ${reason}. Nothing is loaded or downloaded; "studio models fetch" replaces the files that do not match.`,
    fetchUnpinned:
      'the search model manifest still has provisional values; nothing was downloaded and search by meaning is unavailable. The rest of the studio works.',
    fetchFailed:
      'the search model was not installed (the download, folder or check failed); search by meaning is unavailable. Try "studio models fetch" again when the network is available.',
    fetchInvalidSource: 'the manifest or the model source in scripts/models could not be validated (or @studio/shared was not built); nothing was downloaded.',
    fetchNotStarted: 'could not run /bin/bash to download the model; nothing was downloaded.',
    fetchOther: (exitCode) => `the search model script exited with code ${exitCode ?? 'unknown'}; nothing was confirmed.`,
    manifestChanged: (text) => `[warning] the manifest changed during the download: ${text}.`,
  },
  embed: {
    scopes: {
      unindexed: 'unindexed versions',
      stale: 'versions with a vector from another model (--stale)',
      all: 'every version (--all)',
    },
    nothingIndexed: 'Nothing was indexed; the versions stay pending and search by words keeps working.',
    unknownModel: 'unknown model',
    heading: (scope, modelRef, duration) => `Indexing (${scope}) with ${modelRef} in ${duration}:`,
    embedded: (count) => `  versions indexed now: ${count}`,
    failed: (count) => `  versions without a document (still pending; see logs/cli.log): ${count}`,
  },
};
