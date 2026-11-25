import { HyperframesPinMismatchError, enableReadiness, pinnedBinPath, sandboxProfile, type PinMismatchDetail } from '@studio/hyperframes';
import {
  HYPERFRAMES_CHROME_VERSION,
  HYPERFRAMES_PIN,
  engineState,
  type HyperframesEngineFiles,
  type HyperframesEngineState,
} from '@studio/shared/hyperframes';
import { readHyperframesEngineFiles } from '@studio/shared/hyperframes/files';
import { type DoctorCheck } from '../doctor/doctor-check.js';
import { cliText } from '../i18n/messages.js';
import { formatBytes } from '../output/format.js';
import { type CliSettings } from '../settings/cli-settings.js';
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

export async function readHyperframesStatus(settings: CliSettings, options: { sandboxAvailable: boolean }): Promise<HyperframesStatus> {
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
    readiness: current === null ? null : enableReadiness(files, current),
  };
}

/** The refusal `enable` would give, or null when every requirement holds. */
export function enableRefusal(status: HyperframesStatus): string | null {
  const text = cliText().hyperframes.status;
  if (status.pin.status === 'mismatch') return pinMismatchText(status.pin.detail);
  if (!status.sandboxAvailable) return text.sandboxUnavailable;
  if (status.readiness === null) return text.profileUnreadable;
  if (status.readiness !== 'ready') return `${engineStateReason(status.readiness)} ${engineStateNextStep(status.readiness)}`;
  return null;
}

/** The next owner step, in the order the steps are taken (O2, O3, O4). */
export function nextStep(status: HyperframesStatus): string {
  const text = cliText().hyperframes.status;
  if (status.pin.status === 'mismatch' || status.profile.status === 'unreadable') return text.reinstall;
  if (!status.sandboxAvailable) return text.useRemotion;
  if (status.readiness !== null && status.readiness !== 'ready') return engineStateNextStep(status.readiness);
  if (status.state === 'engine-disabled') return text.runEnable;
  return text.noneReady;
}

function chromeCheck(files: HyperframesEngineFiles): DoctorCheck {
  const text = cliText().hyperframes.status;
  const label = text.chromeLabel;
  if (files.chrome.status === 'absent') return { label, status: 'warning', detail: text.notInstalled };
  if (files.chrome.status === 'invalid') return { label, status: 'warning', detail: text.chromeJsonInvalid };
  if (!files.chromeBinaryPresent) return { label, status: 'warning', detail: text.chromeFileMissing };
  return { label, status: 'ok', detail: text.chromeInstalled(HYPERFRAMES_CHROME_VERSION, formatBytes(files.chrome.value.sizeBytes)) };
}

function traceCheck(status: HyperframesStatus): DoctorCheck {
  const text = cliText().hyperframes.status;
  const label = text.traceLabel;
  const { trace } = status.files;
  if (trace.status === 'absent') return { label, status: 'warning', detail: text.traceNotDone };
  if (trace.status === 'invalid') return { label, status: 'warning', detail: text.traceJsonInvalid };
  const at = trace.value.at;
  if (trace.value.result !== 'pass') return { label, status: 'warning', detail: text.traceFail(at, trace.value.findings.length) };
  if (status.readiness === 'trace-stale') return { label, status: 'warning', detail: text.traceStale(at) };
  return { label, status: 'ok', detail: text.tracePass(at) };
}

function engineCheck(status: HyperframesStatus): DoctorCheck {
  const text = cliText().hyperframes.status;
  const label = text.engineLabel;
  if (status.files.engine.status === 'invalid') return { label, status: 'warning', detail: text.engineJsonInvalid };
  if (status.state === null) return { label, status: 'warning', detail: text.engineUnknown };
  if (status.state === 'ready') return { label, status: 'ok', detail: text.engineReady };
  if (status.state === 'engine-disabled') return { label, status: 'ok', detail: text.engineOff };
  return { label, status: 'warning', detail: text.engineOnBut(engineStateReason(status.state)) };
}

/**
 * The lines of `status` and `doctor`. HyperFrames is opt-in and off by default, so every line is at
 * most a warning: an incomplete setup never fails `doctor`.
 */
export function hyperframesChecks(status: HyperframesStatus): DoctorCheck[] {
  const text = cliText().hyperframes.status;
  return [
    status.pin.status === 'ok'
      ? { label: 'HyperFrames', status: 'ok', detail: text.pinInstalled(HYPERFRAMES_PIN) }
      : { label: 'HyperFrames', status: 'warning', detail: pinMismatchText(status.pin.detail) },
    {
      label: text.nodeLabel,
      status: status.nodeOk ? 'ok' : 'warning',
      detail: text.nodeDetail(status.nodeVersion, MINIMUM_NODE_MAJOR),
    },
    { label: text.sandboxLabel, status: status.sandboxAvailable ? 'ok' : 'warning', detail: status.sandboxAvailable ? text.available : text.unavailable },
    chromeCheck(status.files),
    {
      label: text.configLabel,
      status: status.files.configSeeded ? 'ok' : 'warning',
      detail: status.files.configSeeded ? text.prepared : text.notPrepared,
    },
    traceCheck(status),
    engineCheck(status),
    { label: text.nextLabel, status: 'ok', detail: nextStep(status) },
  ];
}
