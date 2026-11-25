import { join } from 'node:path';
import { ReferenceInspector } from '@studio/core/asset-store';
import { locateResourceRoot } from '@studio/core/runtime';
import { checkRenderRuntime, completeRenderRuntime, sandboxProfile } from '@studio/hyperframes';
import { writeTraceFile, readHyperframesEngineFiles } from '@studio/shared/hyperframes/files';
import { TerminalRequiredError } from '../errors/cli.errors.js';
import { ExitCode } from '../errors/exit-codes.js';
import { cliText } from '../i18n/messages.js';
import { renderRuntimeRequest, startingProcess, withScratchFolder } from '../hyperframes/cli-runtime.js';
import { HyperframesStepRefusedError, renderRuntimeRefusalError, withHyperframesErrors } from '../hyperframes/hyperframes.errors.js';
import { type HyperframesCommandPorts } from '../hyperframes/hyperframes-ports.js';
import { traceConfirmationWord, traceNotice } from '../hyperframes/hyperframes-texts.js';
import { TRACE_TEMPLATE_FOLDER, runNetworkTrace } from '../hyperframes/network-trace.js';
import { askTypedConfirmation } from '../hyperframes/typed-confirmation.js';
import { type CommandDependencies } from './command-dependencies.js';
import { recordHyperframesEvent } from './hyperframes.command.js';

const COMMAND_NAME = 'hyperframes trace';
/** The seed template is a few kilobytes; anything near this means the folder is not the template. */
const TEMPLATE_MAX_BYTES = 16 * 1024 * 1024;

/**
 * Owner step O3 (SPEC 0008 sections 5.6 and 17.9). On a terminal, after a typed confirmation, and
 * only when the render runtime gate (purpose `trace`) answers ready: Chrome recorded and unchanged
 * (section 17.6), the config seeded, the pin, the sandbox and every path checked before any
 * process. A refusal there writes no `trace.json` (AC 92). The steps then run in `runNetworkTrace`;
 * a failure inside the trace is a finding in a failing record instead (section 18.2). Exit 0 on
 * `pass`, 6 on `fail` (the record is written either way).
 */
export async function hyperframesTraceCommand(ports: HyperframesCommandPorts, dependencies: CommandDependencies): Promise<number> {
  const { settings, printer, signal } = dependencies;
  if (!ports.terminal.isInteractive()) throw new TerminalRequiredError(COMMAND_NAME);
  return withHyperframesErrors(async () => {
    const dataHomeRoot = settings.dataHome.root;
    const checked = await checkRenderRuntime(renderRuntimeRequest(settings, 'trace'));
    if (checked.status === 'refused') throw renderRuntimeRefusalError(checked.reason);
    const files = await readHyperframesEngineFiles(dataHomeRoot);
    // The gate has just read `chrome.json`; it can only be gone now if it was removed in between.
    if (files.chrome.status !== 'present') throw HyperframesStepRefusedError.forState('chrome-missing');
    const chrome = files.chrome.value;
    const profile = sandboxProfile();
    // The checkout in development; `payload/resources/` (same relative path) when packaged.
    const templateSource = join(locateResourceRoot(settings.runtime, settings.studioRoot), TRACE_TEMPLATE_FOLDER);
    const template = await new ReferenceInspector(settings.dataHome).inspectFolder(templateSource, { maxBytes: TEMPLATE_MAX_BYTES, signal });

    for (const line of traceNotice()) printer.line(line);
    const word = traceConfirmationWord();
    await askTypedConfirmation(ports.terminal, signal, { label: cliText().hyperframes.tracePrompt(word), expected: word });

    const outcome = await withScratchFolder('studio-hyperframes-trace-', async (scratchFolder) => {
      const completed = await completeRenderRuntime(checked.runtime, startingProcess(settings, scratchFolder));
      if (completed.status === 'refused') throw renderRuntimeRefusalError(completed.reason);
      const { runtime } = completed;
      // `runtime.tmpDir` is the scratch folder's real path: the staged copy under it is a sandbox parameter.
      return runNetworkTrace(
        { runtime, templateSource, scratchDir: runtime.tmpDir, templateContentHash: template.contentHash, chrome, profileSha256: profile.sha256 },
        { process: ports.process(signal), system: ports.system, now: ports.now, signal },
      );
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
