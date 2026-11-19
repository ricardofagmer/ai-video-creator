// Type-only: erased at compile time, so the native runtime is required on the first `load` only.
import type { InferenceSession, Tensor } from 'onnxruntime-node';
import { type EmbeddingModelManifest } from '@studio/shared/catalog';
import { EmbeddingModelLoadError, EmbeddingOutputInvalidError, InvalidModelManifestError } from './embeddings.errors';
import { isPinnedManifest, readEmbeddingModelManifest } from './embedding-manifest';
import { type EmbeddingModelPort, type EmbeddingRole } from './embedding-model.port';
import { readPinnedModelFile, selectPinnedModelFiles } from './pinned-model-files';
import { TextTokenizer } from './text-tokenizer';
import { buildTokenBatch, meanPoolAndNormalize, type TokenBatch } from './token-batch';

/** B9: at most 8 texts per inference; a longer call is split, never refused. */
const MAX_TEXTS_PER_RUN = 8;

/** The graph inputs this adapter can feed; a graph needing any other input is refused at load. */
const SUPPORTED_INPUTS = new Set(['input_ids', 'attention_mask', 'token_type_ids']);

/** Token-level encoder output; the first output is used when the graph names it otherwise. */
const HIDDEN_STATE_OUTPUT = 'last_hidden_state';

type OnnxRuntime = typeof import('onnxruntime-node');

type ManifestState =
  | { readonly status: 'valid'; readonly manifest: EmbeddingModelManifest }
  | { readonly status: 'invalid'; readonly error: InvalidModelManifestError };

interface LoadedModel {
  readonly runtime: OnnxRuntime;
  readonly session: InferenceSession;
  readonly tokenizer: TextTokenizer;
  readonly outputName: string;
}

function inputTensors(runtime: OnnxRuntime, session: InferenceSession, batch: TokenBatch): Record<string, Tensor> {
  const shape = [batch.batchSize, batch.sequenceLength];
  const byName: Record<string, BigInt64Array> = {
    input_ids: batch.inputIds,
    attention_mask: batch.attentionMask,
    token_type_ids: batch.tokenTypeIds,
  };
  const feeds: Record<string, Tensor> = {};
  for (const name of session.inputNames) {
    const data = byName[name];
    if (data === undefined) throw new EmbeddingModelLoadError('session-shape');
    feeds[name] = new runtime.Tensor('int64', data, shape);
  }
  return feeds;
}

/** The `[batch, sequence, dimensions]` float32 output of one run, or a refusal. */
function hiddenStates(output: Tensor | undefined, batch: TokenBatch, dimensions: number): Float32Array {
  if (output === undefined || output.type !== 'float32' || !(output.data instanceof Float32Array)) {
    throw new EmbeddingOutputInvalidError('dimensions');
  }
  const [rows, columns, width] = output.dims;
  if (output.dims.length !== 3 || rows !== batch.batchSize || columns !== batch.sequenceLength || width !== dimensions) {
    throw new EmbeddingOutputInvalidError('dimensions');
  }
  return output.data;
}

/**
 * The one production adapter of `EmbeddingModelPort` (ADR 0004, option L of docs/vetting/0001):
 * `onnxruntime-node` runs the pinned ONNX graph on the CPU and `@huggingface/tokenizers` turns
 * text into ids. Neither library is given a URL, a model id or a cache folder: the session is
 * built from bytes and the tokenizer from parsed JSON, both read from the verified model folder
 * and re-hashed against the manifest first. There is no hub client, no download and no network
 * call in this file (D10). Both libraries are imported on the first `load`, so the api and the
 * CLI start without loading the native runtime when nobody searches by meaning.
 *
 * Texts are prefixed by role, embedded and dropped: nothing here logs or keeps them.
 */
export class OnnxEmbeddingModel implements EmbeddingModelPort {
  private loaded: LoadedModel | null = null;

  private constructor(private readonly manifestState: ManifestState) {}

  /**
   * Reads the committed manifest once. An unusable or still-unpinned manifest does not stop the
   * process: `manifest()` throws it later and the runtime reports the model `absent`.
   */
  static async fromManifestFile(manifestFile: string): Promise<OnnxEmbeddingModel> {
    try {
      const manifest = await readEmbeddingModelManifest(manifestFile);
      if (!isPinnedManifest(manifest)) return new OnnxEmbeddingModel({ status: 'invalid', error: new InvalidModelManifestError('unpinned') });
      return new OnnxEmbeddingModel({ status: 'valid', manifest });
    } catch (error) {
      if (error instanceof InvalidModelManifestError) return new OnnxEmbeddingModel({ status: 'invalid', error });
      throw error;
    }
  }

  manifest(): EmbeddingModelManifest {
    if (this.manifestState.status === 'invalid') throw this.manifestState.error;
    return this.manifestState.manifest;
  }

  async load(modelDirectory: string): Promise<void> {
    if (this.loaded !== null) return;
    const manifest = this.manifest();
    const files = selectPinnedModelFiles(manifest);
    const tokenizer = await TextTokenizer.create({
      tokenizerJson: await readPinnedModelFile(modelDirectory, files.tokenizer),
      tokenizerConfigJson: await readPinnedModelFile(modelDirectory, files.tokenizerConfig),
      tokenizerFile: files.tokenizer.path,
      tokenizerConfigFile: files.tokenizerConfig.path,
      maxInputTokens: manifest.maxInputTokens,
    });
    const graph = await readPinnedModelFile(modelDirectory, files.graph);
    const runtime = await import('onnxruntime-node');
    const session = await runtime.InferenceSession.create(graph, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
      // Errors only: the runtime's own warnings would reach the process logs as noise.
      logSeverityLevel: 3,
    });
    const names = session.inputNames;
    if (!names.includes('input_ids') || !names.includes('attention_mask') || names.some((name) => !SUPPORTED_INPUTS.has(name))) {
      await session.release();
      throw new EmbeddingModelLoadError('session-shape', files.graph.path);
    }
    const outputName = session.outputNames.includes(HIDDEN_STATE_OUTPUT) ? HIDDEN_STATE_OUTPUT : session.outputNames[0];
    if (outputName === undefined) {
      await session.release();
      throw new EmbeddingModelLoadError('session-shape', files.graph.path);
    }
    this.loaded = { runtime, session, tokenizer, outputName };
  }

  async embed(texts: readonly string[], role: EmbeddingRole): Promise<readonly Float32Array[]> {
    const loaded = this.loaded;
    if (loaded === null) throw new EmbeddingModelLoadError('not-loaded');
    const manifest = this.manifest();
    const prefix = role === 'query' ? manifest.queryPrefix : manifest.passagePrefix;
    const vectors: Float32Array[] = [];
    for (let start = 0; start < texts.length; start += MAX_TEXTS_PER_RUN) {
      const sequences = texts.slice(start, start + MAX_TEXTS_PER_RUN).map((text) => loaded.tokenizer.encode(`${prefix}${text}`));
      const batch = buildTokenBatch(sequences, loaded.tokenizer.padTokenId);
      const results = await loaded.session.run(inputTensors(loaded.runtime, loaded.session, batch));
      const hidden = hiddenStates(results[loaded.outputName], batch, manifest.dimensions);
      vectors.push(...meanPoolAndNormalize(hidden, batch, manifest.dimensions));
    }
    return vectors;
  }
}
