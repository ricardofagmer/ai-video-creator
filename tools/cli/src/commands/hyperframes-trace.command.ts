import { join } from 'node:path';
import { ReferenceInspector } from '@studio/core/asset-store';
import { locateResourceRoot } from '@studio/core/runtime';
import { HyperframesChromeMissingError, pinnedBinPath, sandboxProfile, verifyChromeBinary } from '@studio/hyperframes';
import { hyperframesPaths } from '@studio/shared/hyperframes';
import { writeTraceFile, readHyperframesEngineFiles } from '@studio/shared/hyperframes/files';
import { TerminalRequiredError } from '../errors/cli.errors.js';
import { ExitCode } from '../errors/exit-codes.js';
import { cliText } from '../i18n/messages.js';
import { resolveRenderRuntime, withScratchFolder } from '../hyperframes/cli-runtime.js';
import { HyperframesCommandError, HyperframesStepRefusedError, withHyperframesErrors } from '../hyperframes/hyperframes.errors.js';
import { type HyperframesCommandPorts } from '../hyperframes/hyperframes-ports.js';
import { runtimeFailureText, traceConfirmationWord, traceNotice } from '../hyperframes/hyperframes-texts.js';
import { TRACE_TEMPLATE_FOLDER, runNetworkTrace } from '../hyperframes/network-trace.js';
import { askTypedConfirmation } from '../hyperframes/typed-confirmation.js';
import { type CommandDependencies } from './command-dependencies.js';
import { recordHyperframesEvent } from './hyperframes.command.js';

const COMMAND_NAME = 'hyperframes trace';
/** The seed template is a few kilobytes; anything near this means the folder is not the template. */
const TEMPLATE_MAX_BYTES = 16 * 1024 * 1024;

/**
 * A Chrome failure of the check before the trace starts (the binary changed, unreadable, or outside
 * the Chrome folder) is the `chrome-missing` refusal, and `trace.json` is not written (SPEC 0008
 * section 17.9, AC 92). A failure inside the trace, before or after the render, is a finding in a
 * failing record instead (section 18.2).
 */
async function withChromeRefusal<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof HyperframesChromeMissingError) throw HyperframesStepRefusedError.forState('chrome-missing');
    throw error;
  }
}

/**
 * Owner step O3 (SPEC 0008 sections 5.6 and 17.9). On a terminal, after a typed confirmation, and
 * only with Chrome recorded and the config seeded. The confirmed work starts by verifying the
 * Chrome binary against `chrome.json` (section 17.6), before any process; the steps then run in
 * `runNetworkTrace` on the rev 2 runtime. This command checks the prerequisites, hashes the
 * template, writes `trace.json` and shows every finding. Exit 0 on `pass`, 6 on `fail` (the record
 * is written either way; a Chrome refusal writes none).
 */
export async function hyperframesTraceCommand(ports: HyperframesCommandPorts, dependencies: CommandDependencies): Promise<number> {
  const { settings, printer, signal } = dependencies;
  if (!ports.terminal.isInteractive()) throw new TerminalRequiredError(COMMAND_NAME);
  return withHyperframesErrors(async () => {
    const dataHomeRoot = settings.dataHome.root;
    const files = await readHyperframesEngineFiles(dataHomeRoot);
    if (files.chrome.status !== 'present' || !files.chromeBinaryPresent) throw HyperframesStepRefusedError.forState('chrome-missing');
    if (!files.configSeeded) throw HyperframesStepRefusedError.forState('runtime-not-prepared');
    if (!ports.system.sandboxExecExists()) throw new HyperframesCommandError('dependency', runtimeFailureText('sandbox-unavailable'));
    const chrome = files.chrome.value;
    const binPath = pinnedBinPath();
    const profile = sandboxProfile();
    // The checkout in development; `payload/resources/` (same relative path) when packaged.
    const templateSource = join(locateResourceRoot(settings.runtime, settings.studioRoot), TRACE_TEMPLATE_FOLDER);
    const template = await new ReferenceInspector(settings.dataHome).inspectFolder(templateSource, { maxBytes: TEMPLATE_MAX_BYTES, signal });

    for (const line of traceNotice()) printer.line(line);
    const word = traceConfirmationWord();
    await askTypedConfirmation(ports.terminal, signal, { label: cliText().hyperframes.tracePrompt(word), expected: word });

    const outcome = await withChromeRefusal(async () => {
      await verifyChromeBinary(chrome, { cacheDir: hyperframesPaths(dataHomeRoot).cacheDir });
      return withScratchFolder('studio-hyperframes-trace-', async (scratchFolder) => {
        const runtime = await resolveRenderRuntime(settings, {
          binPath,
          tmpDir: scratchFolder,
          browserPath: chrome.executablePath,
          sandboxProfilePath: profile.path,
        });
        // `runtime.tmpDir` is the scratch folder's real path: the staged copy under it is a sandbox parameter.
        return runNetworkTrace(
          { runtime, templateSource, scratchDir: runtime.tmpDir, templateContentHash: template.contentHash, chrome, profileSha256: profile.sha256 },
          { process: ports.process(signal), system: ports.system, now: ports.now, signal },
        );
      });
    });
    await writeTraceFile(dataHomeRoot, outcome.record);

    const { record } = outcome;
    const text = cliText().hyperframes.traceResult;
    const answer = (value: boolean): string => (value ? text.yes : text.no);
    printer.line(text.result(record.result));
    printer.line(text.controlDenied(answer(record.controlDenied)));
    printer.line(text.renderCode(record.renderExitCode));
    printer.line(text.outputOk(answer(record.outputOk)));
    printer.line(text.deniedNetwork(record.deniedNetwork));
    printer.line(text.ownerFolderDenied(record.ownerConfigDirDenied));
    if (outcome.findings.length > 0) {
      printer.line(text.findingsHeading(outcome.findings.length, record.findings.length));
      for (const finding of outcome.findings) printer.line(`  - ${finding}`);
    }
    printer.line(record.result === 'pass' ? text.nextEnable : text.stillOff);
    await recordHyperframesEvent(ports, printer, {
      event: 'hyperframes.trace-finished',
      result: record.result,
      deniedNetwork: record.deniedNetwork,
      controlDenied: record.controlDenied,
    });
    return record.result === 'pass' ? ExitCode.ok : ExitCode.unhealthy;
  });
}
