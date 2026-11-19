import { Module } from '@nestjs/common';
import { EmbeddingsModule, onnxEmbeddingModelPortProvider } from '@studio/core/embeddings';
import { CliModule } from './cli.module.js';

/**
 * Composition root for the CLI commands that index or search by meaning (`catalog embed`,
 * `catalog search --semantic`, `models status`, `doctor`; SPEC 0003 section 5.2, B9). It adds the
 * one embeddings module instance to the CLI graph, so its query handlers register on the buses
 * `CliModule` owns, once. The model loads lazily, from the verified model folder only: booting
 * this module opens no network connection and loads no native runtime until a command embeds.
 */
@Module({
  imports: [CliModule, EmbeddingsModule.forRoot({ modelPort: onnxEmbeddingModelPortProvider() })],
})
export class CliSearchModule {}
