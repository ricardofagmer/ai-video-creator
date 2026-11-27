// Typed failure and plain output for the dmg staging modules. Messages carry paths, versions,
// sizes and checksums only, never an environment value or a secret.
import process from 'node:process';

export class StagingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StagingError';
  }
}

export function fail(message) {
  throw new StagingError(message);
}

export function say(line) {
  process.stdout.write(`${line}\n`);
}

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasErrorCode(error, code) {
  return isRecord(error) && error.code === code;
}
