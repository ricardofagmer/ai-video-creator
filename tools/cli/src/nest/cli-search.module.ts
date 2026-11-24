import { type DynamicModule, Module } from '@nestjs/common';
import { EmbeddingsModule, onnxEmbeddingModelPortProvider, runtimeEmbeddingManifestFile } from '@studio/core/embeddings';
import { type StudioRuntime } from '@studio/core/runtime';
import { CliModule } from './cli.module.js';

/**
 * Composition root for the CLI commands that index or search by meaning (`catalog embed`,
 * `catalog search --semantic`, `models status`, `doctor`; SPEC 0003 section 5.2, B9). It adds the
 * one embeddings module instance to the CLI graph, so its query handlers register on the buses
 * `CliModule` owns, once. The model loads lazily, from the verified model folder only: booting
 * this module opens no network connection and loads no native runtime until a command embeds.
 */
@Module({})
export class CliSearchModule {
  /**
   * Plan C3 rev 3, DI-AC-03: the runtime comes from `CliSettings`, so `main.ts` stays the only
   * reader of the environment and `doctor` and the model read one manifest (the checkout in
   * development, `payload/resources/` when packaged).
   */
  static forRuntime(runtime: StudioRuntime): DynamicModule {
    const modelPort = onnxEmbeddingModelPortProvider({ manifestPath: () => runtimeEmbeddingManifestFile(runtime) });
    return { module: CliSearchModule, imports: [CliModule, EmbeddingsModule.forRoot({ modelPort })] };
  }
}
