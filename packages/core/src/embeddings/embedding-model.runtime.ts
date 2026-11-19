import { Inject, Injectable, Logger } from '@nestjs/common';
import { type EmbeddingModelManifest } from '@studio/shared/catalog';
import { DataHome } from '../paths/data-home';
import { EmbeddingOutputInvalidError, EmbeddingUnavailableError } from './embeddings.errors';
import { EMBEDDING_MODEL_PORT, type EmbeddingModelPort, type EmbeddingRole } from './embedding-model.port';
import { verifyModelDirectory, type ModelIntegrityResult } from './model-integrity';
import { toUnitVector } from './vector-math';

/**
 * The model state of this process (the `model` field of `SearchIndexStatusResponse`). `modelRef`
 * is null only when the committed manifest itself is not usable.
 */
export type EmbeddingModelState =
  | { readonly status: 'ready'; readonly manifest: EmbeddingModelManifest }
  | { readonly status: 'absent'; readonly modelRef: string | null }
  | { readonly status: 'rejected'; readonly modelRef: string };

export interface EmbeddedTexts {
  readonly manifest: EmbeddingModelManifest;
  /** Unit-normalized, one per input text, in order. */
  readonly vectors: readonly Float32Array[];
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

/**
 * Lazily loads the local model once per process (ADR 0004 decision 1) and guards every inference.
 * Before the first inference it re-hashes every manifest file (decision 4, R2-AC-07): any missing
 * file, size or hash mismatch refuses the load and nothing is downloaded. `rejected` and `ready`
 * are kept for the life of the process (a restart re-checks); `absent` is re-checked on the next
 * call, so `studio models fetch` takes effect without restarting the api.
 */
@Injectable()
export class EmbeddingModelRuntime {
  private readonly logger = new Logger(EmbeddingModelRuntime.name);
  private settled: EmbeddingModelState | null = null;
  private inFlight: Promise<EmbeddingModelState> | null = null;
  private absenceLogged = false;

  constructor(
    @Inject(EMBEDDING_MODEL_PORT) private readonly port: EmbeddingModelPort,
    private readonly dataHome: DataHome,
  ) {}

  /** The state after a load attempt; the first call in a process verifies and loads the model. */
  async state(): Promise<EmbeddingModelState> {
    if (this.settled !== null) return this.settled;
    this.inFlight ??= this.attemptLoad().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Embeds texts with the ready model; throws `EmbeddingUnavailableError` when it is not ready. */
  async embed(texts: readonly string[], role: EmbeddingRole): Promise<EmbeddedTexts> {
    const state = await this.state();
    if (state.status !== 'ready') throw new EmbeddingUnavailableError(state.status);
    const raw = await this.port.embed(texts, role);
    if (raw.length !== texts.length) throw new EmbeddingOutputInvalidError('count');
    const vectors = raw.map((vector) => toUnitVector(vector, state.manifest.dimensions));
    return { manifest: state.manifest, vectors };
  }

  private async attemptLoad(): Promise<EmbeddingModelState> {
    let manifest: EmbeddingModelManifest;
    try {
      manifest = this.port.manifest();
    } catch (error) {
      this.logger.error({ event: 'embeddings.manifest-invalid', errorName: errorName(error) });
      return this.settle({ status: 'absent', modelRef: null });
    }
    const startedAt = Date.now();
    let integrity: ModelIntegrityResult;
    try {
      integrity = await verifyModelDirectory(this.dataHome.embeddingModelDirectory(manifest.modelRef), manifest);
    } catch (error) {
      // An unreadable folder (permissions, I/O) is refused like a bad file; nothing is fetched.
      this.logger.error({ event: 'embeddings.model-load-failed', modelRef: manifest.modelRef, errorName: errorName(error) });
      return this.settle({ status: 'rejected', modelRef: manifest.modelRef });
    }
    if (integrity.status === 'absent') {
      if (!this.absenceLogged) this.logger.warn({ event: 'embeddings.model-absent', modelRef: manifest.modelRef });
      this.absenceLogged = true;
      return { status: 'absent', modelRef: manifest.modelRef };
    }
    if (integrity.status === 'rejected') {
      this.logger.error({ event: 'embeddings.model-rejected', modelRef: manifest.modelRef, reason: integrity.reason, file: integrity.file });
      return this.settle({ status: 'rejected', modelRef: manifest.modelRef });
    }
    try {
      await this.port.load(this.dataHome.embeddingModelDirectory(manifest.modelRef));
    } catch (error) {
      // The files are intact but the runtime refused them; the same refusal as a bad file.
      this.logger.error({ event: 'embeddings.model-load-failed', modelRef: manifest.modelRef, errorName: errorName(error) });
      return this.settle({ status: 'rejected', modelRef: manifest.modelRef });
    }
    this.logger.log({
      event: 'embeddings.model-loaded',
      modelRef: manifest.modelRef,
      loadMs: Date.now() - startedAt,
      dimensions: manifest.dimensions,
    });
    return this.settle({ status: 'ready', manifest });
  }

  private settle(state: EmbeddingModelState): EmbeddingModelState {
    this.settled = state;
    return state;
  }
}
