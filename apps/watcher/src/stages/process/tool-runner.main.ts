import { BlockedError } from '@studio/shared/ace';
import { ExternalToolError, InputError, ProviderError } from '@ace/toolbox/dist/errors';
import { HyperframesProcessFailedError, HyperframesProcessStartError, HyperframesRuntimeError, createSpawnProcessPort } from '@studio/hyperframes';
import { NavigationRefusedError, liveCapture, pageText, render } from './runner/browser.handlers';
import { hyperframesRender, realHyperframesRenderPorts } from './runner/hyperframes.handlers';
import { captionBurn, fades, mediaReview, musicBed, narrationAssemble, slateRender, testCapture } from './runner/media.handlers';
import { PathConfinementError, confineRequest, realRunnerRoots } from './runner/path-confinement';
import { describeRunnerTools, requireRunnerTools, resolveRunnerTools, type RunnerTools } from './runner/runner-tools';
import { RESULT_MARKER, ToolRunnerEnvelopeSchema, type RunnerErrorKind, type ToolRunnerReply, type ToolRunnerRequest } from './tool-runner.protocol';

/**
 * Child entry of the tool runner (see `tool-runner.client.ts`). Started with an explicit minimal
 * environment, it resolves ffmpeg/ffprobe once from that environment, reads one envelope from
 * stdin, confines every path the request names to the envelope's roots by real path, runs it and
 * prints one marked result line. Error
 * messages name the command and the failure class only: toolbox errors can carry stderr, paths or
 * provider bodies, which stay on this process's stderr and never reach a run file.
 */

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function dispatch(request: ToolRunnerRequest, tools: RunnerTools): Promise<unknown> {
  // Any `request.tools` is ignored: the media programs are the paths resolved at this process's start.
  switch (request.command) {
    case 'media-review':
      return mediaReview(request, requireRunnerTools(tools));
    case 'music-bed':
      return musicBed(request, requireRunnerTools(tools));
    case 'fades':
      return fades(request, requireRunnerTools(tools));
    case 'caption-burn':
      return captionBurn(request, requireRunnerTools(tools));
    case 'slate-render':
      return slateRender(request, requireRunnerTools(tools));
    case 'test-capture':
      return testCapture(request, requireRunnerTools(tools));
    case 'narration-assemble':
      return narrationAssemble(request, requireRunnerTools(tools));
    case 'render':
      return render(request);
    case 'live-capture':
      return liveCapture(request);
    case 'page-text':
      return pageText(request);
    case 'hyperframes-render':
      // No signal of its own: a stop kills this runner's process group, sandbox and Chrome included.
      return hyperframesRender(request, realHyperframesRenderPorts(createSpawnProcessPort()));
  }
}

function errorKind(error: unknown): RunnerErrorKind {
  if (error instanceof BlockedError || error instanceof NavigationRefusedError || error instanceof PathConfinementError) return 'blocked';
  if (error instanceof HyperframesProcessFailedError || error instanceof HyperframesProcessStartError) return 'tool';
  // Sandbox, pin or Chrome missing: the watcher checks these before the start, so reaching here is a refusal.
  if (error instanceof HyperframesRuntimeError) return 'blocked';
  if (error instanceof InputError) return 'input';
  if (error instanceof ProviderError) return 'provider';
  if (error instanceof ExternalToolError) return 'tool';
  return 'internal';
}

function printReply(reply: ToolRunnerReply): void {
  process.stdout.write(`\n${RESULT_MARKER}${JSON.stringify(reply)}\n`);
}

async function main(): Promise<void> {
  const tools = resolveRunnerTools(process.env);
  process.stderr.write(`${describeRunnerTools(tools)}\n`);
  const parsed = ToolRunnerEnvelopeSchema.safeParse(JSON.parse(await readStdin()));
  if (!parsed.success) {
    printReply({ ok: false, error: { kind: 'input', message: 'tool runner request did not match its contract' } });
    return;
  }
  const command = parsed.data.request.command;
  try {
    const roots = await realRunnerRoots(parsed.data.roots);
    if (roots.read === null) process.stderr.write(`tool-runner: ${command} inputs are not confined (the caller named no read roots)\n`);
    const request = await confineRequest(parsed.data.request, roots);
    printReply({ ok: true, result: await dispatch(request, tools) });
  } catch (error) {
    const kind = errorKind(error);
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    printReply({ ok: false, error: { kind, message: `${command} failed (${kind})` } });
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    printReply({ ok: false, error: { kind: 'internal', message: 'tool runner crashed' } });
    process.exit(1);
  },
);
