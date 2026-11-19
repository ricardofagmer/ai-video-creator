import { Secret } from './secret';
import { SECRET_ENVIRONMENT_VARIABLES, SECRET_NAMES, SECRET_VALUE_PATTERN, type SecretName } from './secret-names';
import { MalformedSecretError } from './secrets.errors';

/** Keys found in the environment when the module graph was built; values wrapped at once. */
export type EnvironmentSecrets = ReadonlyMap<SecretName, Secret>;

/** Nest token for the snapshot; the `SecretsModule` factory is the only reader of the environment. */
export const ENVIRONMENT_SECRETS = Symbol('ENVIRONMENT_SECRETS');

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

/** Trims, then refuses a non-key value by name only; an unset or empty variable means "not set". */
export function wrapSecretValue(name: SecretName, source: Secret['source'], raw: string): Secret | null {
  const value = raw.trim();
  if (value === '') return null;
  if (!SECRET_VALUE_PATTERN.test(value)) throw new MalformedSecretError(name, source);
  return new Secret(name, source, value);
}

/** Reads only the named variables; every other variable is ignored. */
export function readEnvironmentSecrets(environment: EnvironmentSource): EnvironmentSecrets {
  const secrets = new Map<SecretName, Secret>();
  for (const name of SECRET_NAMES) {
    const raw = environment[SECRET_ENVIRONMENT_VARIABLES[name]];
    if (raw === undefined) continue;
    const secret = wrapSecretValue(name, 'environment', raw);
    if (secret !== null) secrets.set(name, secret);
  }
  return secrets;
}
