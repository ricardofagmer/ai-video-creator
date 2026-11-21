import { HYPERFRAMES_CHROME_VERSION, HYPERFRAMES_PIN, type HyperframesEngineState } from '@studio/shared/hyperframes';
import { type ChromeMissingDetail, type HyperframesRuntimeFailure, type PinMismatchDetail } from '@studio/hyperframes';
import { type ProbedControlId } from './trace-controls.js';

/*
 * pt-BR texts of `studio hyperframes` (SPEC 0008 sections 5.5 to 5.7 and 7). They carry states,
 * versions and counts only: never a path, a variable value or child output (K12).
 */

/** Section 5.7, the reason and what to do; `ready` has no refusal. */
const engineStateTexts: Readonly<Record<Exclude<HyperframesEngineState, 'ready'>, { reason: string; next: string }>> = {
  'engine-disabled': {
    reason: 'O motor HyperFrames está desligado.',
    next: 'Rode `studio hyperframes status` e siga os passos, ou vincule um modelo Remotion.',
  },
  'chrome-missing': { reason: 'O Chrome do HyperFrames não está instalado.', next: 'Rode `studio hyperframes chrome install`.' },
  'runtime-not-prepared': {
    reason: 'A pasta de configuração do HyperFrames não foi preparada.',
    next: 'Rode `studio hyperframes chrome install`.',
  },
  'trace-missing': {
    reason: 'A verificação de rede do HyperFrames não foi feita para esta versão.',
    next: 'Rode `studio hyperframes trace` e depois `studio hyperframes enable`.',
  },
  'trace-stale': {
    reason: 'A verificação de rede do HyperFrames não foi feita para esta versão.',
    next: 'Rode `studio hyperframes trace` e depois `studio hyperframes enable`.',
  },
};

export function engineStateReason(state: Exclude<HyperframesEngineState, 'ready'>): string {
  return engineStateTexts[state].reason;
}

export function engineStateNextStep(state: Exclude<HyperframesEngineState, 'ready'>): string {
  return engineStateTexts[state].next;
}

const pinDetailTexts: Readonly<Record<PinMismatchDetail, string>> = {
  'not-installed': 'não instalado',
  'outside-workspace': 'instalado fora do estúdio',
  'manifest-unreadable': 'manifesto ilegível',
  'other-version': 'outra versão instalada',
};

export function pinMismatchText(detail: PinMismatchDetail): string {
  return `A versão instalada do HyperFrames não é a aprovada (${HYPERFRAMES_PIN}): ${pinDetailTexts[detail]}. Reinstale as dependências do estúdio.`;
}

const chromeDetailTexts: Readonly<Record<ChromeMissingDetail, string>> = {
  none: 'nenhum Chrome encontrado na pasta do estúdio',
  several: 'mais de um Chrome encontrado na pasta do estúdio',
  'other-version': `o Chrome encontrado não é a versão ${HYPERFRAMES_CHROME_VERSION}`,
  unreadable: 'a pasta do Chrome não pôde ser lida',
  changed: 'o Chrome registrado mudou depois da instalação',
};

export function chromeMissingText(detail: ChromeMissingDetail): string {
  return `O Chrome do HyperFrames não foi registrado: ${chromeDetailTexts[detail]}. Nada foi gravado.`;
}

const runtimeFailureTexts: Readonly<Record<Exclude<HyperframesRuntimeFailure, 'pin-mismatch' | 'chrome-missing'>, string>> = {
  'sandbox-unavailable': 'O isolamento de rede do macOS não está disponível. O motor HyperFrames não roda sem ele.',
  'process-start-failed': 'O processo do HyperFrames não pôde ser iniciado.',
  'render-failed': 'A renderização do HyperFrames terminou com erro.',
  'browser-ensure-failed': 'O download do Chrome do HyperFrames terminou com erro. Nada foi gravado.',
};

export function runtimeFailureText(reason: Exclude<HyperframesRuntimeFailure, 'pin-mismatch' | 'chrome-missing'>): string {
  return runtimeFailureTexts[reason];
}

/** Section 5.5: what `chrome install` announces before it asks for the typed version. */
export function chromeInstallNotice(destination: string): readonly string[] {
  return [
    'Instalação do Chrome do HyperFrames (passo O2)',
    `  versão: chrome-headless-shell ${HYPERFRAMES_CHROME_VERSION} (mac-arm64)`,
    '  tamanho: cerca de 195 MB',
    '  origem: storage.googleapis.com/chrome-for-testing-public',
    `  destino: ${destination}`,
    'É o único processo do HyperFrames que acessa a rede, e só esse endereço é esperado.',
  ];
}

/** Sections 5.6 and 17.9: what `trace` announces before it asks for the typed confirmation. */
export const TRACE_NOTICE: readonly string[] = [
  'Verificação de rede do HyperFrames (passo O3)',
  '  0. conferência do binário do Chrome com chrome.json (tamanho e sha-256), antes de iniciar qualquer processo;',
  '  1. cinco controles dentro do isolamento, todos devem ser negados: conexão para 192.0.2.1:9 (também registrada no log),',
  '     iniciar /usr/bin/true, criar um arquivo na pasta do HyperFrames, listar a pasta de dados e conectar à porta da API do estúdio;',
  '  2. uma renderização do modelo do estúdio (title-card) dentro do isolamento;',
  '  3. leitura do log do sistema na janela da renderização;',
  '  4. conferência do Chrome de novo, do vídeo, da pasta de configuração e das leituras negadas da sua pasta ~/.hyperframes;',
  '  5. gravação de trace.json.',
  'Nada sai do Mac: toda conexão fora do loopback é negada pelo isolamento.',
];

/** Section 17.9: what each of C2 to C5 tries; a control the sandbox did not refuse fails the trace. */
const probedControlTexts: Readonly<Record<ProbedControlId, string>> = {
  C2: 'iniciar /usr/bin/true',
  C3: 'criar um arquivo na pasta do HyperFrames',
  C4: 'listar a pasta de dados do estúdio',
  C5: 'conectar à porta da API do estúdio em 127.0.0.1',
};

export function traceControlNotRefusedText(control: ProbedControlId, exitCode: number): string {
  return `controle ${control}: a tentativa de ${probedControlTexts[control]} não foi negada pelo isolamento (código ${exitCode})`;
}

export const TRACE_PROBE_FILE_REMOVED_TEXT = 'controle C3: o arquivo de teste ficou na pasta do HyperFrames e foi removido';

export function traceChromeBeforeText(status: 'changed' | 'unreadable'): string {
  return status === 'changed'
    ? 'Chrome: o binário mudou antes da renderização (sha-256 ou tamanho diferente de chrome.json); a renderização não foi iniciada'
    : 'Chrome: o binário não pôde ser lido antes da renderização; a renderização não foi iniciada';
}

export const TRACE_CHROME_CHANGED_AFTER_TEXT = 'Chrome: o binário mudou durante a renderização (sha-256 ou tamanho diferente de chrome.json)';

/** A denial of another kind that no control caused: the profile working, shown without changing the result. */
export function traceInformationalDenialText(description: string): string {
  return `informativo (não muda o resultado): negado ${description}`;
}

export const TRACE_CONFIRMATION_WORD = 'verificar';
