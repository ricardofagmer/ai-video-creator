export {
  BIOMETRIC_REFERENCE_SOURCE,
  BiometricReferenceLimitError,
  MAX_BIOMETRIC_REFERENCES,
  type BiometricReferenceSource,
} from './biometric-reference.source';
export { BIOMETRIC_REPLACEMENT, SECRET_REPLACEMENT } from './redaction.patterns';
export { RedactionModule } from './redaction.module';
export {
  MAX_REDACTION_DEPTH,
  MAX_REDACTION_INPUT_CHARS,
  MAX_REDACTION_NODES,
  type RedactionCounts,
  type RedactionFailureReason,
} from './redactor';
export { BIOMETRIC_PATHS_TTL_MS, REDACTION_FAILED_TEXT, RedactorService, type RedactionResult } from './redactor.service';
