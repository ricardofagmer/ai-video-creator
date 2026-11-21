import { HyperframesPinMismatchError, pinnedBinPath, sandboxProfile, type PinMismatchDetail } from '@studio/hyperframes';
import {
  HYPERFRAMES_CHROME_VERSION,
  HYPERFRAMES_FORMAT_VERSION,
  HYPERFRAMES_PIN,
  engineState,
  type HyperframesEngineFiles,
  type HyperframesEngineState,
} from '@studio/shared/hyperframes';
import { readHyperframesEngineFiles } from '@studio/shared/hyperframes/files';
import { type DoctorCheck } from '../doctor/doctor-check.js';
import { formatBytes } from '../output/format.js';
import { type CliSettings } from '../settings/cli-settings.js';
import { HYPERFRAMES_CLI_ACTOR } from './cli-runtime.js';
import { engineStateNextStep, engineStateReason, pinMismatchText } from './hyperframes-texts.js';

/*
 * The read-only view behind `studio hyperframes status`, `enable` and `studio doctor` (SPEC 0008
 * section 7). It reads the three gate files, the config marker, the installed pin and the
 * profile hash; it starts nothing and writes nothing.
 */

/** `hyperframes` 0.9.72 declares `engines.node >= 22`. */
const MINIMUM_NODE_MAJOR = 22;

export type PinState = { status: 'ok' } | { status: 'mismatch'; detail: PinMismatchDetail };
export type ProfileState = { status: 'ok'; sha256: string } | { status: 'unreadable' };

export interface HyperframesStatus {
  pin: PinState;
  nodeVersion: string;
  nodeOk: boolean;
  sandboxAvailable: boolean;
  profile: ProfileState;
  files: HyperframesEngineFiles;
  /** `engineState` with the stored `engine.json`; null when the profile hash is unreadable. */
  state: HyperframesEngineState | null;
  /** `engineState` as if the engine were enabled: what `enable` would get. */
  readiness: HyperframesEngineState | null;
}

function readPin(): PinState {
  try {
    pinnedBinPath();
    return { status: 'ok' };
  } catch (error) {
    if (error instanceof HyperframesPinMismatchError) return { status: 'mismatch', detail: error.detail };
    throw error;
  }
}

function readProfile(): ProfileState {
  try {
    return { status: 'ok', sha256: sandboxProfile().sha256 };
  } catch {
    // A missing or unreadable profile means the runtime package is broken; reported, never ready.
    return { status: 'unreadable' };
  }
}

function assumingEnabled(files: HyperframesEngineFiles, at: Date): HyperframesEngineFiles {
  return {
    ...files,
    engine: { status: 'present', value: { format: HYPERFRAMES_FORMAT_VERSION, state: 'enabled', updatedAt: at.toISOString(), updatedBy: HYPERFRAMES_CLI_ACTOR } },
  };
}

export async function readHyperframesStatus(settings: CliSettings, options: { now: Date; sandboxAvailable: boolean }): Promise<HyperframesStatus> {
  const files = await readHyperframesEngineFiles(settings.dataHome.root);
  const profile = readProfile();
  const nodeVersion = process.versions.node;
  const nodeMajor = Number.parseInt(nodeVersion.split('.')[0] ?? '', 10);
  const current = profile.status === 'ok' ? { profileSha256: profile.sha256 } : null;
  return {
    pin: readPin(),
    nodeVersion,
    nodeOk: Number.isSafeInteger(nodeMajor) && nodeMajor >= MINIMUM_NODE_MAJOR,
    sandboxAvailable: options.sandboxAvailable,
    profile,
    files,
    state: current === null ? null : engineState(files, current),
    readiness: current === null ? null : engineState(assumingEnabled(files, options.now), current),
  };
}

/** The refusal `enable` would give, or null when every requirement holds. */
export function enableRefusal(status: HyperframesStatus): string | null {
  if (status.pin.status === 'mismatch') return pinMismatchText(status.pin.detail);
  if (!status.sandboxAvailable) return 'O isolamento de rede do macOS não está disponível. O motor HyperFrames não roda sem ele.';
  if (status.readiness === null) return 'O perfil de isolamento do HyperFrames não pôde ser lido. Reinstale as dependências do estúdio.';
  if (status.readiness !== 'ready') return `${engineStateReason(status.readiness)} ${engineStateNextStep(status.readiness)}`;
  return null;
}

/** The next owner step, in the order the steps are taken (O2, O3, O4). */
export function nextStep(status: HyperframesStatus): string {
  if (status.pin.status === 'mismatch' || status.profile.status === 'unreadable') return 'Reinstale as dependências do estúdio.';
  if (!status.sandboxAvailable) return 'O motor HyperFrames não roda sem o isolamento do macOS; use um modelo Remotion.';
  if (status.readiness !== null && status.readiness !== 'ready') return engineStateNextStep(status.readiness);
  if (status.state === 'engine-disabled') return 'Rode `studio hyperframes enable`.';
  return 'Nenhum: o motor está ligado e pronto.';
}

function chromeCheck(files: HyperframesEngineFiles): DoctorCheck {
  const label = 'Chrome do HyperFrames';
  if (files.chrome.status === 'absent') return { label, status: 'warning', detail: 'não instalado' };
  if (files.chrome.status === 'invalid') return { label, status: 'warning', detail: 'registro chrome.json inválido' };
  if (!files.chromeBinaryPresent) return { label, status: 'warning', detail: 'registrado, mas o arquivo não está na pasta do estúdio' };
  return { label, status: 'ok', detail: `${HYPERFRAMES_CHROME_VERSION} instalado (${formatBytes(files.chrome.value.sizeBytes)})` };
}

function traceCheck(status: HyperframesStatus): DoctorCheck {
  const label = 'verificação de rede';
  const { trace } = status.files;
  if (trace.status === 'absent') return { label, status: 'warning', detail: 'não feita' };
  if (trace.status === 'invalid') return { label, status: 'warning', detail: 'registro trace.json inválido' };
  const when = `em ${trace.value.at}`;
  if (trace.value.result !== 'pass') return { label, status: 'warning', detail: `fail ${when} (${trace.value.findings.length} achados)` };
  if (status.readiness === 'trace-stale') return { label, status: 'warning', detail: `pass ${when}, mas de outra versão, Chrome ou perfil` };
  return { label, status: 'ok', detail: `pass ${when}` };
}

function engineCheck(status: HyperframesStatus): DoctorCheck {
  const label = 'motor HyperFrames';
  if (status.files.engine.status === 'invalid') return { label, status: 'warning', detail: 'registro engine.json inválido; tratado como desligado' };
  if (status.state === null) return { label, status: 'warning', detail: 'estado desconhecido (perfil ilegível)' };
  if (status.state === 'ready') return { label, status: 'ok', detail: 'ligado e pronto' };
  if (status.state === 'engine-disabled') return { label, status: 'ok', detail: 'desligado' };
  return { label, status: 'warning', detail: `ligado, mas: ${engineStateReason(status.state)}` };
}

/**
 * The lines of `status` and `doctor`. HyperFrames is opt-in and off by default, so every line is at
 * most a warning: an incomplete setup never fails `doctor`.
 */
export function hyperframesChecks(status: HyperframesStatus): DoctorCheck[] {
  return [
    status.pin.status === 'ok'
      ? { label: 'HyperFrames', status: 'ok', detail: `${HYPERFRAMES_PIN} instalado` }
      : { label: 'HyperFrames', status: 'warning', detail: pinMismatchText(status.pin.detail) },
    {
      label: 'Node para HyperFrames',
      status: status.nodeOk ? 'ok' : 'warning',
      detail: `${status.nodeVersion} (mínimo ${MINIMUM_NODE_MAJOR})`,
    },
    { label: 'isolamento do macOS', status: status.sandboxAvailable ? 'ok' : 'warning', detail: status.sandboxAvailable ? 'disponível' : 'indisponível' },
    chromeCheck(status.files),
    {
      label: 'configuração do HyperFrames',
      status: status.files.configSeeded ? 'ok' : 'warning',
      detail: status.files.configSeeded ? 'preparada' : 'não preparada',
    },
    traceCheck(status),
    engineCheck(status),
    { label: 'próximo passo do HyperFrames', status: 'ok', detail: nextStep(status) },
  ];
}
