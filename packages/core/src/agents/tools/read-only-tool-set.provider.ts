import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ENVELOPE_PAGINATION_KEY, ENVELOPE_RESULT_KEY, agentToolAllowlists, type AgentToolName, type RunArtifactId } from '@studio/shared/agents';
import { type AssetVersion, type Tag } from '@studio/shared/catalog';
import { readRunFile } from '@studio/shared/run-files';
import { type RunFile } from '@studio/shared/run-format';
import { AssetStoreModule, ContentStore, ReferenceInspector } from '../../asset-store';
import { GetAssetVersionQuery } from '../../catalog';
import { RedactorService } from '../../redaction';
import { BiometricRunGuard } from '../../review/biometric-guard';
import { type AgentsModuleOptions } from '../agents.module';
import { AgentRunError } from '../agents.errors';
import { type AgentToolScope, type AgentToolSet, type AgentToolSetProvider } from '../tooling/agent-tool-set';
import { assetDescribeTool, type DescribedAsset } from './asset-describe.tool';
import { AssetTextReader } from './asset-text.reader';
import { catalogSearchTool, type CatalogSearchBinding } from './catalog-search.tool';
import { frameSampleTool } from './frame-sample.tool';
import { toMastraTool, type ToolResultForm } from './mastra-tool.adapter';
import { runArtifactReadTool } from './run-artifact-read.tool';
import { siteScreenshotTool } from './site-screenshot.tool';
import { nextOffsetOf } from './text-page';
import { BoundedCache, StepStateRegistry, type StepToolState } from './tool-state';
import { invokeGuardedTool, type GuardedTool } from './tool-wrapper';

/** Run-lived memo sizes; versions and recorded artifacts are immutable, so entries never go stale. */
const DESCRIBE_MEMO_ENTRIES = 128;
const ARTIFACT_MEMO_ENTRIES = 64;
const BRAND_KIT_SLOT = 'brand-kit';

type MastraTool = AgentToolSet[string];

/**
 * R1-13 implementation of the R1-12 `AgentToolSetProvider` seam: builds, per agent call, only the
 * read-only tools that both the role's C7 `agentToolAllowlists` row and the bound allowlist name.
 * Everything a tool is bound to (run, folder, stage, step, recipe kinds, artifact allowlist,
 * offered refs) comes from the engine's scope and `run.json`, never from model arguments. Every
 * call goes through `invokeGuardedTool`. Per-step state (frame counter, offered refs, step memos)
 * and the run-lived memos live here, server-side.
 */
@Injectable()
export class ReadOnlyAgentToolSetProvider implements AgentToolSetProvider {
  private readonly logger = new Logger(ReadOnlyAgentToolSetProvider.name);
  private readonly steps = new StepStateRegistry();
  private readonly describeMemo = new BoundedCache<string, DescribedAsset>(DESCRIBE_MEMO_ENTRIES);
  private readonly artifactMemo = new BoundedCache<string, string>(ARTIFACT_MEMO_ENTRIES);
  private readonly textReader: AssetTextReader;
  /** The review module's promotion guard, reused so frame sampling and promotion can never disagree. */
  private readonly biometricRuns: BiometricRunGuard;

  constructor(
    private readonly queries: QueryBus,
    private readonly redactor: RedactorService,
    store: ContentStore,
    references: ReferenceInspector,
  ) {
    this.textReader = new AssetTextReader({ store, references, redactor });
    this.biometricRuns = new BiometricRunGuard(queries);
  }

  async toolsFor(scope: AgentToolScope): Promise<AgentToolSet> {
    const names = [...new Set(scope.allowlist.filter((name) => agentToolAllowlists[scope.role].includes(name)))];
    if (names.length === 0) return {};
    const run = await this.readBoundRun(scope);
    const state = this.steps.stateFor(scope.runId, scope.stepKey);
    const tools: AgentToolSet = {};
    for (const name of names) tools[name] = await this.build(name, { scope, state, run });
    return tools;
  }

  /**
   * First page of every artifact, then the following pages in turn, so a long artifact cannot use
   * up the calls the others need. A read the tool refuses (an artifact the run did not produce)
   * is kept as its typed answer: the Reviewer's instructions tell it what that means.
   */
  async readArtifacts(scope: AgentToolScope, artifactIds: readonly RunArtifactId[], maxCalls: number): Promise<string[]> {
    await this.readBoundRun(scope);
    const binding = { scope, state: this.steps.stateFor(scope.runId, scope.stepKey) };
    const tool = runArtifactReadTool({ redactor: this.redactor, memo: this.artifactMemo }, scope);
    const pending: { artifact: RunArtifactId; offset: number }[] = artifactIds.map((artifact) => ({ artifact, offset: 0 }));
    const blocks: string[] = [];
    for (let calls = 0; calls < maxCalls; calls += 1) {
      const next = pending.shift();
      if (next === undefined) break;
      const output = await invokeGuardedTool(tool, binding, next.offset === 0 ? { artifact: next.artifact } : next);
      const result = output[ENVELOPE_RESULT_KEY];
      blocks.push(typeof result === 'string' ? result : `${next.artifact}: ${JSON.stringify(result)}`);
      const offset = nextOffsetOf(output[ENVELOPE_PAGINATION_KEY]);
      if (offset !== null) pending.push({ artifact: next.artifact, offset });
    }
    return blocks;
  }

  private async build(name: AgentToolName, context: { scope: AgentToolScope; state: StepToolState; run: RunFile }): Promise<MastraTool> {
    const { scope, state, run } = context;
    switch (name) {
      case 'CatalogSearchTool':
        return this.wrap(catalogSearchTool({ queries: this.queries, redactor: this.redactor }, await this.catalogBinding(run)), scope, state, 'json');
      case 'AssetDescribeTool':
        return this.wrap(
          assetDescribeTool({ queries: this.queries, redactor: this.redactor, textReader: this.textReader, memo: this.describeMemo }),
          scope,
          state,
          'json',
        );
      case 'RunArtifactReadTool':
        return this.wrap(runArtifactReadTool({ redactor: this.redactor, memo: this.artifactMemo }, scope), scope, state, 'json');
      case 'FrameSampleTool':
        return this.wrap(frameSampleTool({ redactor: this.redactor, biometricRuns: this.biometricRuns }), scope, state, 'images');
      case 'SiteScreenshotTool':
        return this.wrap(siteScreenshotTool(), scope, state, 'images');
    }
  }

  private wrap<Input, Result, Handoff>(
    tool: GuardedTool<Input, Result, Handoff>,
    scope: AgentToolScope,
    state: StepToolState,
    resultForm: ToolResultForm,
  ): MastraTool {
    return toMastraTool({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      resultForm,
      invoke: (input) => invokeGuardedTool(tool, { scope, state }, input),
    });
  }

  /** Construction binding: the run folder must hold the run the engine named. */
  private async readBoundRun(scope: AgentToolScope): Promise<RunFile> {
    let run: RunFile;
    try {
      run = await readRunFile(scope.runDir);
    } catch {
      // The C5 error can name paths; the call fails by kind only.
      throw new AgentRunError(scope.role, { kind: 'configuration', reason: 'tools-unavailable' });
    }
    if (run.runId !== scope.runId) throw new AgentRunError(scope.role, { kind: 'configuration', reason: 'tools-unavailable' });
    return run;
  }

  /** `recipe.allowedKinds` (the guard) and `brandKit.tagHints` (description only, topology 3.3). */
  private async catalogBinding(run: RunFile): Promise<CatalogSearchBinding> {
    const definition = run.recipe.definition;
    return { allowedKinds: definition.allowedKinds, tagHints: await this.brandKitTagHints(run) };
  }

  private async brandKitTagHints(run: RunFile): Promise<readonly Tag[]> {
    const binding = run.recipe.definition.bindings.find((candidate) => candidate.slot === BRAND_KIT_SLOT);
    if (binding === undefined) return [];
    let version: AssetVersion;
    try {
      version = await this.queries.execute(new GetAssetVersionQuery(binding.ref));
    } catch (error) {
      // Hints only shape the tool description; the engine's preflight owns binding failures.
      this.logger.warn({ event: 'agents.tools.brand-kit-hints-unavailable', errorName: error instanceof Error ? error.name : 'unknown' });
      return [];
    }
    if (version.kind !== 'brand-kit' || version.sensitivity === 'biometric' || version.contentHash !== binding.contentHash) return [];
    return version.details.tagHints;
  }
}

/** Pass to `AgentsModule.register({ toolSet: readOnlyAgentToolSet })` in a composition root. */
export const readOnlyAgentToolSet: NonNullable<AgentsModuleOptions['toolSet']> = {
  imports: [AssetStoreModule],
  useClass: ReadOnlyAgentToolSetProvider,
};
