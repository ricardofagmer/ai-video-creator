import { constants } from 'node:fs';
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  HyperframesChromeMissingError,
  HyperframesProcessFailedError,
  buildRenderEnv,
  buildSandboxArgs,
  hashChromeBinary,
  renderPicture,
  type HyperframesProcessPort,
  type HyperframesRuntime,
  type RecordedChromeBinary,
  type RenderPictureRequest,
  checkPicture,
  type PictureExpectation,
} from '@studio/hyperframes';
import { HYPERFRAMES_FORMAT_VERSION, HYPERFRAMES_PIN, hyperframesBounds, type HyperframesTraceFile } from '@studio/shared/hyperframes';
import { HYPERFRAMES_CLI_ACTOR } from './cli-runtime.js';
import { type HyperframesSystemPort, type SandboxDenial } from './hyperframes-ports.js';
import { cliText } from '../i18n/messages.js';
import {
  traceChromeBeforeText,
  traceChromeChangedAfterText,
  traceChromeUnreadableAfterText,
  traceControlNotLoggedText,
  traceControlNotRefusedText,
  traceInformationalDenialText,
  traceProbeFileRemovedText,
} from './hyperframes-texts.js';
import { pictureFindings } from './picture-findings.js';
import { describeDenial, isFileDenial, isNetworkDenial } from './sandbox-log.js';
import {
  NETWORK_CONTROL_TARGET,
  PROBED_CONTROLS,
  isNetworkControlDenial,
  isProbedControlDenial,
  runTraceControls,
  type TraceControlTargets,
} from './trace-controls.js';

/*
 * The network-trace gate (SPEC 0008 sections 5.6 and 17.9, OD3, AC 85, AC 92, AC 93). The render
 * uses exactly `buildRenderArgv` and `buildRenderEnv` through `renderPicture`; the five controls
 * use the same `buildSandboxArgs` result and environment, so the trace adds no flag, key or
 * profile of its own. `pass` needs all of: C1 denied and logged, C2 to C5 refused, the Chrome hash
 * equal to `chrome.json` before and after the render, render exit 0, correct output, zero other
 * network denials and no `credentials*` file in the studio config folder.
 */

/** The studio seed template (`title-card-hf-template` in `seeds/catalog.seed.json`). */
export const TRACE_TEMPLATE_FOLDER = join('seeds', 'templates', 'hyperframes', 'title-card');
const TRACE_EXPECTATION: PictureExpectation = Object.freeze({ width: 1080, height: 1920, fps: 30, durationS: 30 });
/** Fixed values for the template's declared variables; no owner text reaches the trace. They are video content, so they stay pt-BR in every language. */
const TRACE_VARIABLES = Object.freeze({ title: 'Verificação de rede', hook: 'Renderização de teste do estúdio', disclosure: '', accent: '#f97316', durationS: 30 });

const WINDOW_MARGIN_MS = 1000;
const LOG_FLUSH_MS = 2000;
/** `renderExitCode` when the render was not started because the Chrome binary changed before it. */
const RENDER_NOT_STARTED = -1;

export class TraceTemplateError extends Error {
  constructor(reason: 'not-a-plain-file' | 'too-many-files') {
    super(`The trace template folder was refused (${reason})`);
    this.name = 'TraceTemplateError';
  }
}

export interface NetworkTraceInputs {
  runtime: HyperframesRuntime;
  templateSource: string;
  /** A private, empty scratch folder, by its real path; `runtime.tmpDir` is this folder. */
  scratchDir: string;
  templateContentHash: string;
  /** `chrome.json`, verified by the command before any start (section 17.6); compared, never recorded. */
  chrome: RecordedChromeBinary;
  profileSha256: string;
}

export interface NetworkTracePorts {
  process: HyperframesProcessPort;
  system: HyperframesSystemPort;
  now(): Date;
  signal: AbortSignal;
}

export interface NetworkTraceOutcome {
  record: HyperframesTraceFile;
  /** Every finding, for the owner's screen; the record keeps at most 20. */
  findings: readonly string[];
}

/** Copies the template folder file by file; a link or any other kind of entry refuses. */
async function stageTemplate(source: string, target: string): Promise<void> {
  let copied = 0;
  const walk = async (from: string, to: string): Promise<void> => {
    await mkdir(to, { mode: 0o700 });
    for (const entry of await readdir(from, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(join(from, entry.name), join(to, entry.name));
      else if (entry.isFile()) {
        copied += 1;
        if (copied > hyperframesBounds.maxFiles) throw new TraceTemplateError('too-many-files');
        await copyFile(join(from, entry.name), join(to, entry.name), constants.COPYFILE_EXCL);
      } else throw new TraceTemplateError('not-a-plain-file');
    }
  };
  await walk(source, target);
}

function isInsideOrEqual(folder: string, candidate: string): boolean {
  return candidate === folder || candidate.startsWith(`${folder}/`);
}

async function credentialFileCount(configDir: string): Promise<number> {
  const names = await readdir(configDir);
  return names.filter((name) => name.toLowerCase().startsWith('credentials')).length;
}

function boundFindings(findings: readonly string[]): string[] {
  const clipped = findings.map((finding) => finding.slice(0, hyperframesBounds.findingChars));
  if (clipped.length <= hyperframesBounds.traceFindings) return clipped;
  const kept = clipped.slice(0, hyperframesBounds.traceFindings - 1);
  return [...kept, cliText().hyperframes.findings.andMore(clipped.length - kept.length)];
}

type ChromeHashCheck = { status: 'same'; sha256: string } | { status: 'changed'; sha256: string } | { status: 'unreadable' };

/**
 * `chromeSha256` when the binary could not be read after the render (SPEC 0008 section 18.2): the
 * schema needs a sha-256, and no binary hashes to all zeros, so `engineState` never reads it as ready.
 */
const UNREADABLE_CHROME_SHA256 = '0'.repeat(64);

/** The hash of the binary the render runs, computed from its bytes and compared with `chrome.json`. */
async function checkChromeHash(browserPath: string, recorded: RecordedChromeBinary): Promise<ChromeHashCheck> {
  try {
    const { sha256, sizeBytes } = await hashChromeBinary(browserPath);
    return sha256 === recorded.sha256 && sizeBytes === recorded.sizeBytes ? { status: 'same', sha256 } : { status: 'changed', sha256 };
  } catch (error) {
    if (error instanceof HyperframesChromeMissingError) return { status: 'unreadable' };
    throw error;
  }
}

/** One render; its exit code (0 on success). */
async function renderOnce(request: RenderPictureRequest, ports: NetworkTracePorts): Promise<number> {
  try {
    await renderPicture(request, { process: ports.process, sandboxExecExists: ports.system.sandboxExecExists });
    return 0;
  } catch (error) {
    if (!(error instanceof HyperframesProcessFailedError)) throw error;
    return error.exitCode;
  }
}

interface LogVerdict {
  controlLogged: boolean;
  otherNetwork: SandboxDenial[];
  ownerFolderDenied: number;
  /** Non-network denials not caused by a control: shown to the owner, never part of the result. */
  informational: SandboxDenial[];
}

const EMPTY_VERDICT: LogVerdict = Object.freeze({ controlLogged: false, otherNetwork: [], ownerFolderDenied: 0, informational: [] });

function classify(denials: readonly SandboxDenial[], context: { ownerConfigDir: string; targets: TraceControlTargets }): LogVerdict {
  const verdict: LogVerdict = { controlLogged: false, otherNetwork: [], ownerFolderDenied: 0, informational: [] };
  for (const denial of denials) {
    if (isNetworkControlDenial(denial)) verdict.controlLogged = true;
    else if (isProbedControlDenial(denial, context.targets)) continue;
    else if (isNetworkDenial(denial)) verdict.otherNetwork.push(denial);
    else if (isFileDenial(denial) && isInsideOrEqual(context.ownerConfigDir, denial.target)) verdict.ownerFolderDenied += 1;
    else verdict.informational.push(denial);
  }
  return verdict;
}

export async function runNetworkTrace(inputs: NetworkTraceInputs, ports: NetworkTracePorts): Promise<NetworkTraceOutcome> {
  const { runtime, scratchDir } = inputs;
  // The staged copy is the TEMPLATE_DIR parameter, so it exists before the controls share the render's arguments.
  const templateDir = join(scratchDir, 'template');
  await stageTemplate(inputs.templateSource, templateDir);
  const sandboxArgs = buildSandboxArgs({ templateDir, runtime });
  const env = buildRenderEnv(runtime);
  const windowStart = new Date(ports.now().getTime() - WINDOW_MARGIN_MS);

  // Step 1: C1 to C5 under the render's own sandbox arguments; a file left by C3 is removed.
  const controls = await runTraceControls({ sandboxArgs, runtime, cwd: scratchDir, env }, ports.process);

  // Step 2: one render of the private copy with fixed variables, only while Chrome still matches chrome.json.
  const chromeBefore = await checkChromeHash(runtime.browserPath, inputs.chrome);
  const variablesFile = join(scratchDir, 'variables.json');
  await writeFile(variablesFile, `${JSON.stringify(TRACE_VARIABLES)}\n`, { flag: 'wx', mode: 0o600 });
  const output = join(scratchDir, 'picture.mp4');
  const renderExitCode = chromeBefore.status === 'same' ? await renderOnce({ templateDir, variablesFile, output, runtime }, ports) : RENDER_NOT_STARTED;
  // The record's hash is computed from the binary after the render, never copied from chrome.json (L1).
  // An unreadable binary still gets a failing record, so the controls and log evidence are kept (section 18.2).
  const chromeAfter = await checkChromeHash(runtime.browserPath, inputs.chrome);

  // Step 3: the system log for the whole window, controls included.
  await ports.system.pause(LOG_FLUSH_MS, ports.signal);
  const log = await ports.system.readSandboxDenials({ start: windowStart, end: new Date(ports.now().getTime() + WINDOW_MARGIN_MS) });
  const verdict = log.status === 'read' ? classify(log.denials, { ownerConfigDir: runtime.ownerConfigDir, targets: controls.targets }) : EMPTY_VERDICT;

  // Step 4: controls, Chrome, output, config folder and the owner-folder count.
  const text = cliText().hyperframes.findings;
  const findings: string[] = [];
  if (log.status !== 'read') findings.push(text.logUnavailable);
  const controlExit = controls.exitCodes.C1;
  // Section 18.7: EPERM (exit 0) is the proof. Unsandboxed, a connect to the TEST-NET-1 address times
  // out or is unreachable (exit 11 or 12); only the sandbox answers EPERM. macOS 27 writes no line
  // for sandbox-exec profile denials, so a missing log line is informational, never a failure.
  const controlDenied = controlExit === 0;
  if (!controlDenied) findings.push(text.networkControl(NETWORK_CONTROL_TARGET, controlExit));
  const notRefused = PROBED_CONTROLS.filter((id) => controls.exitCodes[id] !== 0);
  for (const id of notRefused) findings.push(traceControlNotRefusedText(id, controls.exitCodes[id]));
  if (controls.probeFileRemoved) findings.push(traceProbeFileRemovedText());
  if (chromeBefore.status !== 'same') findings.push(traceChromeBeforeText(chromeBefore.status));
  for (const denial of verdict.otherNetwork) findings.push(text.networkDenied(describeDenial(denial)));
  if (renderExitCode !== 0 && renderExitCode !== RENDER_NOT_STARTED) findings.push(text.renderExit(renderExitCode));
  let outputOk = false;
  if (renderExitCode === 0) {
    // An ffprobe that did not answer reads as no output, which the check reports as unreadable.
    const runProbe = async (program: string, args: readonly string[]): Promise<string> => {
      const read = await ports.system.readProbe(program, args, runtime.path);
      return read.status === 'read' ? read.stdout : '';
    };
    const check = await checkPicture({ ffprobeBin: runtime.ffprobeBin, file: output, expected: TRACE_EXPECTATION }, runProbe);
    outputOk = check.mismatches.length === 0;
    findings.push(...pictureFindings(check, TRACE_EXPECTATION));
  }
  if (chromeAfter.status === 'changed') findings.push(traceChromeChangedAfterText());
  // Only after a render that ran: with no render, the "before" finding already says why (section 18.2).
  else if (chromeAfter.status === 'unreadable' && renderExitCode !== RENDER_NOT_STARTED) findings.push(traceChromeUnreadableAfterText());
  const credentials = await credentialFileCount(runtime.configDir);
  if (credentials > 0) findings.push(text.credentials(credentials));
  if (verdict.ownerFolderDenied > 0) findings.push(text.ownerFolder(verdict.ownerFolderDenied));
  // Last, so the result-bearing findings are the ones kept within the record's bound.
  if (controlDenied && log.status === 'read' && !verdict.controlLogged) findings.push(traceControlNotLoggedText());
  for (const denial of verdict.informational) findings.push(traceInformationalDenialText(describeDenial(denial)));

  // Step 5: the record.
  const chromeMatches = chromeBefore.status === 'same' && chromeAfter.status === 'same';
  const pass =
    log.status === 'read' &&
    controlDenied &&
    notRefused.length === 0 &&
    !controls.probeFileRemoved &&
    chromeMatches &&
    renderExitCode === 0 &&
    outputOk &&
    verdict.otherNetwork.length === 0 &&
    credentials === 0;
  const record: HyperframesTraceFile = {
    format: HYPERFRAMES_FORMAT_VERSION,
    result: pass ? 'pass' : 'fail',
    at: ports.now().toISOString(),
    by: HYPERFRAMES_CLI_ACTOR,
    pin: HYPERFRAMES_PIN,
    chromeSha256: chromeAfter.status === 'unreadable' ? UNREADABLE_CHROME_SHA256 : chromeAfter.sha256,
    profileSha256: inputs.profileSha256,
    templateContentHash: inputs.templateContentHash,
    controlDenied,
    renderExitCode,
    outputOk,
    deniedNetwork: verdict.otherNetwork.length,
    ownerConfigDirDenied: verdict.ownerFolderDenied,
    findings: boundFindings(findings),
  };
  return { record, findings };
}
