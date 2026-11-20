import { CliError } from '../errors/cli.errors.js';
import { type ErrorCategory } from '../errors/exit-codes.js';

/**
 * Why `studio traces export` refused. Each reason maps to one exit code through its category:
 * - `output-exists` (4): the `--out` file exists and `--force` was not given (ADR 0006 decision 2);
 * - `output-not-a-file` (2): `--out` names a link, a folder or another non-regular file;
 * - `output-folder-missing` (2): the folder of `--out` does not exist;
 * - `output-not-writable` (2): the folder or file refuses the write;
 * - `output-inside-data-home` (2): `--out` lies inside the data home, whose files only their
 *   writers may create (RUN-FORMAT section 4);
 * - `target-not-found` (3): no run and no curation folder has that id;
 * - `source-empty` (3): the run or curation has no event the mapper could use;
 * - `source-too-large` (2): a source file is over the export's read bound.
 */
export type TraceExportRefusal =
  | 'output-exists'
  | 'output-not-a-file'
  | 'output-folder-missing'
  | 'output-not-writable'
  | 'output-inside-data-home'
  | 'target-not-found'
  | 'source-empty'
  | 'source-too-large';

const refusalCategories: Readonly<Record<TraceExportRefusal, ErrorCategory>> = {
  'output-exists': 'conflict',
  'output-not-a-file': 'validation',
  'output-folder-missing': 'validation',
  'output-not-writable': 'validation',
  'output-inside-data-home': 'validation',
  'target-not-found': 'not_found',
  'source-empty': 'not_found',
  'source-too-large': 'validation',
};

/** pt-BR (D16). Ids and reasons only: never the `--out` name, a path or file content (SPEC 0006 K7). */
const refusalMessages: Readonly<Record<TraceExportRefusal, string>> = {
  'output-exists': 'O arquivo de --out já existe; nada foi gravado. Use outro nome ou --force para substituí-lo.',
  'output-not-a-file': 'O --out não é um arquivo comum (link simbólico, pasta ou outro tipo); nada foi gravado.',
  'output-folder-missing': 'A pasta do arquivo de --out não existe; nada foi gravado.',
  'output-not-writable': 'Sem permissão para gravar o arquivo de --out; nada foi gravado.',
  'output-inside-data-home': 'O --out fica dentro da pasta de dados do studio; escolha um arquivo fora dela.',
  'target-not-found': 'Nenhuma execução ou curadoria tem esse id.',
  'source-empty': 'Não há eventos para exportar.',
  'source-too-large': 'Um arquivo de eventos passa do limite de leitura da exportação; nada foi gravado.',
};

export class TraceExportError extends CliError {
  override readonly category: ErrorCategory;

  constructor(
    readonly refusal: TraceExportRefusal,
    readonly targetId?: string,
  ) {
    super(`${targetId === undefined ? '' : `Rastro ${targetId}: `}${refusalMessages[refusal]}`);
    this.name = 'TraceExportError';
    this.category = refusalCategories[refusal];
  }
}
