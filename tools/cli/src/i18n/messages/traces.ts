import type { TraceKind } from '@studio/shared/telemetry';
import type { Messages } from '../message-types.js';

type TraceExportRefusal =
  | 'output-exists'
  | 'output-not-a-file'
  | 'output-folder-missing'
  | 'output-not-writable'
  | 'output-inside-data-home'
  | 'target-not-found'
  | 'source-empty'
  | 'source-too-large';

/** `studio traces export`: ids, counts and reasons only, never the `--out` name (SPEC 0006 K7). */
export const tracesPtBR = {
  kinds: { run: 'execução', curation: 'curadoria' } satisfies Record<TraceKind, string>,
  exported: (kind: string, targetId: string, traceId: string) => `Rastro exportado: ${kind} ${targetId}, trace ${traceId}.`,
  spans: (spans: number, spanEvents: number) => `  ${spans} spans e ${spanEvents} eventos de span.`,
  lines: (mapped: number, unmapped: number, sessionsWithoutEnd: number) =>
    `  Linhas: ${mapped} mapeadas, ${unmapped} não mapeadas; ${sessionsWithoutEnd} sessões sem linha final.`,
  dropped: (count: number) => `  Atributos fora da lista permitida descartados: ${count}.`,
  refusalPrefix: (targetId: string) => `Rastro ${targetId}: `,
  refusals: {
    'output-exists': 'O arquivo de --out já existe; nada foi gravado. Use outro nome ou --force para substituí-lo.',
    'output-not-a-file': 'O --out não é um arquivo comum (link simbólico, pasta ou outro tipo); nada foi gravado.',
    'output-folder-missing': 'A pasta do arquivo de --out não existe; nada foi gravado.',
    'output-not-writable': 'Sem permissão para gravar o arquivo de --out; nada foi gravado.',
    'output-inside-data-home': 'O --out fica dentro da pasta de dados do studio; escolha um arquivo fora dela.',
    'target-not-found': 'Nenhuma execução ou curadoria tem esse id.',
    'source-empty': 'Não há eventos para exportar.',
    'source-too-large': 'Um arquivo de eventos passa do limite de leitura da exportação; nada foi gravado.',
  } satisfies Record<TraceExportRefusal, string>,
} as const;

export type TracesMessages = Messages<typeof tracesPtBR>;

export const tracesEs: TracesMessages = {
  kinds: { run: 'ejecución', curation: 'curaduría' },
  exported: (kind, targetId, traceId) => `Traza exportada: ${kind} ${targetId}, trace ${traceId}.`,
  spans: (spans, spanEvents) => `  ${spans} spans y ${spanEvents} eventos de span.`,
  lines: (mapped, unmapped, sessionsWithoutEnd) =>
    `  Líneas: ${mapped} mapeadas, ${unmapped} sin mapear; ${sessionsWithoutEnd} sesiones sin línea final.`,
  dropped: (count) => `  Atributos fuera de la lista permitida descartados: ${count}.`,
  refusalPrefix: (targetId) => `Traza ${targetId}: `,
  refusals: {
    'output-exists': 'El archivo de --out ya existe; no se guardó nada. Usa otro nombre o --force para reemplazarlo.',
    'output-not-a-file': 'El --out no es un archivo común (enlace simbólico, carpeta u otro tipo); no se guardó nada.',
    'output-folder-missing': 'La carpeta del archivo de --out no existe; no se guardó nada.',
    'output-not-writable': 'Sin permiso para escribir el archivo de --out; no se guardó nada.',
    'output-inside-data-home': 'El --out queda dentro de la carpeta de datos del studio; elige un archivo fuera de ella.',
    'target-not-found': 'Ninguna ejecución o curaduría tiene ese id.',
    'source-empty': 'No hay eventos para exportar.',
    'source-too-large': 'Un archivo de eventos supera el límite de lectura de la exportación; no se guardó nada.',
  },
};

export const tracesEn: TracesMessages = {
  kinds: { run: 'run', curation: 'curation' },
  exported: (kind, targetId, traceId) => `Trace exported: ${kind} ${targetId}, trace ${traceId}.`,
  spans: (spans, spanEvents) => `  ${spans} spans and ${spanEvents} span events.`,
  lines: (mapped, unmapped, sessionsWithoutEnd) => `  Lines: ${mapped} mapped, ${unmapped} not mapped; ${sessionsWithoutEnd} sessions without an end line.`,
  dropped: (count) => `  Attributes outside the allowlist dropped: ${count}.`,
  refusalPrefix: (targetId) => `Trace ${targetId}: `,
  refusals: {
    'output-exists': 'The --out file already exists; nothing was written. Use another name or --force to replace it.',
    'output-not-a-file': 'The --out is not a regular file (symbolic link, folder or another kind); nothing was written.',
    'output-folder-missing': 'The folder of the --out file does not exist; nothing was written.',
    'output-not-writable': 'No permission to write the --out file; nothing was written.',
    'output-inside-data-home': "The --out is inside the studio's data folder; choose a file outside it.",
    'target-not-found': 'No run or curation has that id.',
    'source-empty': 'There are no events to export.',
    'source-too-large': "An events file is over the export's read limit; nothing was written.",
  },
};
