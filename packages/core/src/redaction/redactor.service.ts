import { homedir } from 'node:os';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type JsonValue } from '@studio/shared/run-format';
import { SecretsService } from '../secrets/secrets.service';
import { withRealPathSpellings } from './biometric-reference-paths';
import { BIOMETRIC_REFERENCE_SOURCE, type BiometricReferenceSource } from './biometric-reference.source';
import {
  CompiledRedaction,
  RedactionLimitError,
  newRedactionPass,
  type RedactionCounts,
  type RedactionFailureReason,
  type RedactionPass,
} from './redactor';

/** Never carries the input: a failure has a reason only, so a caller cannot write raw text by mistake. */
export type RedactionResult<T> =
  | { status: 'redacted'; value: T; counts: RedactionCounts }
  | { status: 'failed'; reason: RedactionFailureReason };

/** Written in place of a value whose redaction failed. */
export const REDACTION_FAILED_TEXT = '<redaction-failed>';

/** How long registered biometric paths are reused before SQLite is read again. */
export const BIOMETRIC_PATHS_TTL_MS = 30_000;

interface CachedPaths {
  paths: readonly string[];
  loadedAtMs: number;
}

/**
 * Redactor for everything written to run files, events, session streams and logs (criterion 21,
 * topology section 8): loaded key values and secret patterns become `<redacted>`, registered
 * biometric paths `<biometric-ref>`. Fails closed: any error, including an unreadable biometric
 * registry, yields `{ status: 'failed' }` and never the input.
 */
@Injectable()
export class RedactorService {
  private readonly logger = new Logger(RedactorService.name);
  private cachedPaths: CachedPaths | null = null;

  constructor(
    private readonly secrets: SecretsService,
    @Inject(BIOMETRIC_REFERENCE_SOURCE) private readonly biometric: BiometricReferenceSource,
  ) {}

  redactText(text: string): Promise<RedactionResult<string>> {
    return this.run((compiled, pass) => compiled.redactText(text, pass));
  }

  redactJson(value: JsonValue): Promise<RedactionResult<JsonValue>> {
    return this.run((compiled, pass) => compiled.redactJson(value, pass));
  }

  /** For writers that must write something: the redacted text, or `<redaction-failed>`. */
  async redactTextOrPlaceholder(text: string): Promise<string> {
    const result = await this.redactText(text);
    return result.status === 'redacted' ? result.value : REDACTION_FAILED_TEXT;
  }

  private async run<T>(redact: (compiled: CompiledRedaction, pass: RedactionPass) => T): Promise<RedactionResult<T>> {
    let paths: readonly string[];
    try {
      paths = await this.biometricPaths();
    } catch {
      return this.fail('biometric-source-unavailable');
    }
    try {
      const compiled = new CompiledRedaction(this.secrets.loadedSecrets(), paths, homedir());
      const pass = newRedactionPass();
      const value = redact(compiled, pass);
      return { status: 'redacted', value, counts: pass.counts };
    } catch (error) {
      return this.fail(error instanceof RedactionLimitError ? error.reason : 'internal');
    }
  }

  /** Typed registrations plus their realpaths, so a symlinked spelling of either side matches. */
  private async biometricPaths(): Promise<readonly string[]> {
    const now = Date.now();
    if (this.cachedPaths !== null && now - this.cachedPaths.loadedAtMs < BIOMETRIC_PATHS_TTL_MS) return this.cachedPaths.paths;
    const paths = await withRealPathSpellings(await this.biometric.listBiometricReferencePaths());
    this.cachedPaths = { paths, loadedAtMs: now };
    return paths;
  }

  /** Logs the reason only: neither the input nor the underlying error, which may quote it. */
  private fail(reason: RedactionFailureReason): { status: 'failed'; reason: RedactionFailureReason } {
    this.logger.warn({ event: 'redaction.failed', reason });
    return { status: 'failed', reason };
  }
}
