import type { Messages } from '../message-types.js';

type SeedFolderState = 'absent' | 'empty' | 'loaded';

/** Services, catalog commands, passphrase and secrets. */
export const commandsPtBR = {
  services: {
    alreadyRunning: (service: string, pid: number, url: string) => `${service} já estava rodando (pid ${pid}) em ${url}.`,
    started: (service: string, pid: number, url: string) => `${service} iniciado (pid ${pid}) em ${url}.`,
    startedNotReady: (service: string, pid: number, url: string) =>
      `${service} iniciado (pid ${pid}), mas ainda não respondeu em ${url}; confira com "studio doctor".`,
    stopped: (service: string, pid: number) => `${service} parado (pid ${pid}).`,
    notRunning: (service: string) => `${service} não estava rodando.`,
    staleRecordRemoved: (service: string) => `${service} não estava rodando; registro antigo removido.`,
  },
  catalogImport: {
    byReference: 'por referência (nada foi copiado)',
    copied: 'copiado para o acervo',
    created: (ref: string, kind: string, mode: string) => `Asset ${ref} (${kind}) criado como rascunho, ${mode}.`,
    activateInWeb: 'Ative a versão pelo web quando os metadados estiverem completos.',
  },
  rescore: {
    heading: (formulaVersion: number, duration: string) => `Notas de qualidade recalculadas (fórmula v${formulaVersion}, ${duration}):`,
    outcomesRead: (count: number) => `  resultados de revisão lidos: ${count}`,
    versionsScored: (count: number) => `  versões com nota: ${count}`,
    versionsChanged: (changed: number, cleared: number) => `  versões alteradas: ${changed} (das quais ${cleared} ficaram sem nota)`,
    nothingChanged: 'Nenhum valor mudou.',
  },
  search: {
    noIndexed: 'Nenhuma versão indexada para comparar.',
    heading: (modelRef: string, count: number) => `Busca por significado (${modelRef}), ${count} resultado(s), do mais parecido ao menos:`,
    totals: (scanned: number, pending: number) => `Comparadas: ${scanned}. Pendentes (sem vetor do modelo atual): ${pending}.`,
    embedHint: 'Para incluir as pendentes, rode "studio catalog embed".',
  },
  seed: {
    targets: { asset: 'asset', recipe: 'receita' },
    folders: { absent: 'ausente', empty: 'vazia', loaded: 'carregada' } satisfies Record<SeedFolderState, string>,
    created: (target: string, ref: string, entryId: string) => `  criado      ${target} ${ref}  (${entryId})`,
    unchanged: (target: string, ref: string, entryId: string) => `  sem mudança ${target} ${ref}  (${entryId})`,
    failed: (target: string, entryId: string, code: string, message: string) => `  falhou      ${target} ${entryId}: ${code} - ${message}`,
    heading: 'Seed do catálogo:',
    optionalFolders: (recipes: string, prompts: string) => `Pastas opcionais: receitas ${recipes}, prompts ${prompts}.`,
    total: (created: number, unchanged: number, failed: number) => `Total: ${created} criados, ${unchanged} sem mudança, ${failed} com falha.`,
  },
  passphrase: {
    isSet: 'Senha do studio: definida.',
    notSet: 'Senha do studio: não definida. Use "studio passphrase set".',
    first: (min: number) => `Senha do studio (mínimo ${min} caracteres, nada aparece): `,
    repeat: 'Repita a senha: ',
    saved: 'Senha do studio gravada (somente o hash argon2id).',
  },
  secrets: {
    valueRule: (bounds: { min: string; max: string } | null) =>
      `O valor precisa ter${bounds === null ? '' : ` de ${bounds.min} a ${bounds.max} caracteres`}, só caracteres ASCII visíveis, sem espaços.`,
    appCredential: 'credencial do aplicativo',
    key: 'chave',
    storing: (kind: string, name: string, rule: string) => `Guardando a ${kind} ${name} no Keychain. ${rule}`,
    typeWhenAsked: 'Digite o valor quando o macOS pedir; nada aparece na tela.',
    stored: (name: string) => `${name} guardada no Keychain.`,
    envOverrides: (variable: string) => `Aviso: ${variable} está definida no ambiente e tem prioridade sobre o Keychain.`,
  },
} as const;

export type CommandsMessages = Messages<typeof commandsPtBR>;

export const commandsEs: CommandsMessages = {
  services: {
    alreadyRunning: (service, pid, url) => `${service} ya estaba en ejecución (pid ${pid}) en ${url}.`,
    started: (service, pid, url) => `${service} iniciada (pid ${pid}) en ${url}.`,
    startedNotReady: (service, pid, url) => `${service} iniciada (pid ${pid}), pero todavía no respondió en ${url}; verifica con "studio doctor".`,
    stopped: (service, pid) => `${service} detenida (pid ${pid}).`,
    notRunning: (service) => `${service} no estaba en ejecución.`,
    staleRecordRemoved: (service) => `${service} no estaba en ejecución; se eliminó el registro antiguo.`,
  },
  catalogImport: {
    byReference: 'por referencia (no se copió nada)',
    copied: 'copiado al acervo',
    created: (ref, kind, mode) => `Activo ${ref} (${kind}) creado como borrador, ${mode}.`,
    activateInWeb: 'Activa la versión en la web cuando los metadatos estén completos.',
  },
  rescore: {
    heading: (formulaVersion, duration) => `Notas de calidad recalculadas (fórmula v${formulaVersion}, ${duration}):`,
    outcomesRead: (count) => `  resultados de revisión leídos: ${count}`,
    versionsScored: (count) => `  versiones con nota: ${count}`,
    versionsChanged: (changed, cleared) => `  versiones modificadas: ${changed} (de las cuales ${cleared} quedaron sin nota)`,
    nothingChanged: 'Ningún valor cambió.',
  },
  search: {
    noIndexed: 'Ninguna versión indexada para comparar.',
    heading: (modelRef, count) =>
      `Búsqueda por significado (${modelRef}), ${count} ${count === 1 ? 'resultado' : 'resultados'}, del más parecido al menos:`,
    totals: (scanned, pending) => `Comparadas: ${scanned}. Pendientes (sin vector del modelo actual): ${pending}.`,
    embedHint: 'Para incluir las pendientes, ejecuta "studio catalog embed".',
  },
  seed: {
    targets: { asset: 'activo', recipe: 'receta' },
    folders: { absent: 'ausente', empty: 'vacía', loaded: 'cargada' },
    created: (target, ref, entryId) => `  creado      ${target} ${ref}  (${entryId})`,
    unchanged: (target, ref, entryId) => `  sin cambios ${target} ${ref}  (${entryId})`,
    failed: (target, entryId, code, message) => `  falló       ${target} ${entryId}: ${code} - ${message}`,
    heading: 'Seed del catálogo:',
    optionalFolders: (recipes, prompts) => `Carpetas opcionales: recetas ${recipes}, prompts ${prompts}.`,
    total: (created, unchanged, failed) => `Total: ${created} creados, ${unchanged} sin cambios, ${failed} con fallo.`,
  },
  passphrase: {
    isSet: 'Contraseña del studio: definida.',
    notSet: 'Contraseña del studio: no definida. Usa "studio passphrase set".',
    first: (min) => `Contraseña del studio (mínimo ${min} caracteres, no se muestra nada): `,
    repeat: 'Repite la contraseña: ',
    saved: 'Contraseña del studio guardada (solo el hash argon2id).',
  },
  secrets: {
    valueRule: (bounds) =>
      `El valor debe tener${bounds === null ? '' : ` de ${bounds.min} a ${bounds.max} caracteres`}, solo caracteres ASCII visibles, sin espacios.`,
    appCredential: 'credencial de la aplicación',
    key: 'clave',
    storing: (kind, name, rule) => `Guardando la ${kind} ${name} en el Llavero (Keychain). ${rule}`,
    typeWhenAsked: 'Escribe el valor cuando macOS lo pida; no se muestra nada en la pantalla.',
    stored: (name) => `${name} guardada en el Llavero (Keychain).`,
    envOverrides: (variable) => `Aviso: ${variable} está definida en el entorno y tiene prioridad sobre el Llavero (Keychain).`,
  },
};

export const commandsEn: CommandsMessages = {
  services: {
    alreadyRunning: (service, pid, url) => `${service} was already running (pid ${pid}) at ${url}.`,
    started: (service, pid, url) => `${service} started (pid ${pid}) at ${url}.`,
    startedNotReady: (service, pid, url) => `${service} started (pid ${pid}), but has not answered at ${url} yet; check with "studio doctor".`,
    stopped: (service, pid) => `${service} stopped (pid ${pid}).`,
    notRunning: (service) => `${service} was not running.`,
    staleRecordRemoved: (service) => `${service} was not running; old record removed.`,
  },
  catalogImport: {
    byReference: 'by reference (nothing was copied)',
    copied: 'copied into the store',
    created: (ref, kind, mode) => `Asset ${ref} (${kind}) created as a draft, ${mode}.`,
    activateInWeb: 'Activate the version in the web when the metadata is complete.',
  },
  rescore: {
    heading: (formulaVersion, duration) => `Quality scores recomputed (formula v${formulaVersion}, ${duration}):`,
    outcomesRead: (count) => `  review outcomes read: ${count}`,
    versionsScored: (count) => `  versions with a score: ${count}`,
    versionsChanged: (changed, cleared) => `  versions changed: ${changed} (of which ${cleared} lost their score)`,
    nothingChanged: 'No value changed.',
  },
  search: {
    noIndexed: 'No indexed version to compare.',
    heading: (modelRef, count) => `Search by meaning (${modelRef}), ${count} ${count === 1 ? 'result' : 'results'}, most similar first:`,
    totals: (scanned, pending) => `Compared: ${scanned}. Pending (no vector from the current model): ${pending}.`,
    embedHint: 'To include the pending ones, run "studio catalog embed".',
  },
  seed: {
    targets: { asset: 'asset', recipe: 'recipe' },
    folders: { absent: 'missing', empty: 'empty', loaded: 'loaded' },
    created: (target, ref, entryId) => `  created     ${target} ${ref}  (${entryId})`,
    unchanged: (target, ref, entryId) => `  unchanged   ${target} ${ref}  (${entryId})`,
    failed: (target, entryId, code, message) => `  failed      ${target} ${entryId}: ${code} - ${message}`,
    heading: 'Catalog seed:',
    optionalFolders: (recipes, prompts) => `Optional folders: recipes ${recipes}, prompts ${prompts}.`,
    total: (created, unchanged, failed) => `Total: ${created} created, ${unchanged} unchanged, ${failed} failed.`,
  },
  passphrase: {
    isSet: 'Studio passphrase: set.',
    notSet: 'Studio passphrase: not set. Use "studio passphrase set".',
    first: (min) => `Studio passphrase (at least ${min} characters, nothing is shown): `,
    repeat: 'Repeat the passphrase: ',
    saved: 'Studio passphrase saved (only the argon2id hash).',
  },
  secrets: {
    valueRule: (bounds) =>
      `The value must have${bounds === null ? '' : ` ${bounds.min} to ${bounds.max} characters`}, visible ASCII characters only, no spaces.`,
    appCredential: 'app credential',
    key: 'key',
    storing: (kind, name, rule) => `Storing the ${kind} ${name} in the Keychain. ${rule}`,
    typeWhenAsked: 'Type the value when macOS asks; nothing shows on screen.',
    stored: (name) => `${name} stored in the Keychain.`,
    envOverrides: (variable) => `Warning: ${variable} is set in the environment and takes priority over the Keychain.`,
  },
};
