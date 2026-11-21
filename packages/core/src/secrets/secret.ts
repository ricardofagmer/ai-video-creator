import { inspect } from 'node:util';
import { type SecretName } from './secret-names';

/** What every stringification of a secret prints (criterion 21). */
export const REDACTED_TEXT = '<redacted>';

export type SecretSource = 'environment' | 'keychain';

/** A value held in memory whose exact occurrences the redactor replaces; it never exposes the value. */
export interface RedactableValue {
  replaceOccurrences(text: string, replacement: string): { text: string; count: number };
}

/**
 * A value registered with the redactor at run time (a platform token, SPEC 0007 section 5.2).
 * `hasSameValue` lets the registry keep one copy per value without either side revealing it.
 */
export interface RevealedRedactableValue extends RedactableValue {
  hasSameValue(other: RedactableValue): boolean;
}

/**
 * A provider key held in memory only (PRD 12). The value lives in an ES private field, so it is
 * not an own enumerable property: `JSON.stringify`, spread, `Object.keys`, template literals,
 * `String()`, `util.inspect` and Nest/pino serializers all see `<redacted>`. The one way to read
 * the value is `revealForProviderCall`, which only live provider adapters call when they build
 * the outgoing request.
 */
export class Secret implements RedactableValue {
  readonly #value: string;

  constructor(
    readonly name: SecretName,
    readonly source: SecretSource,
    value: string,
  ) {
    this.#value = value;
  }

  /** The only accessor of the value. Callers pass it straight to the provider client. */
  revealForProviderCall(): string {
    return this.#value;
  }

  /**
   * Replaces every exact occurrence of the value in `text`. The value never leaves this class,
   * and no regular expression is built from it, so key characters need no escaping.
   */
  replaceOccurrences(text: string, replacement: string): { text: string; count: number } {
    if (this.#value.length === 0 || !text.includes(this.#value)) return { text, count: 0 };
    const parts = text.split(this.#value);
    return { text: parts.join(replacement), count: parts.length - 1 };
  }

  toString(): string {
    return REDACTED_TEXT;
  }

  toJSON(): string {
    return REDACTED_TEXT;
  }

  [Symbol.toPrimitive](): string {
    return REDACTED_TEXT;
  }

  [inspect.custom](): string {
    return `Secret(${this.name}, ${this.source}, ${REDACTED_TEXT})`;
  }
}
