import { randomBytes } from 'node:crypto';

/*
 * Injected runtime facts of portal pairing (rules/architecture.md: inject the clock): the time and
 * the random source. Tests bind fixed values; production binds the system ones below.
 */

export interface InstallClock {
  now(): Date;
}

/** Cryptographically secure bytes; every code and token is drawn from it. */
export interface InstallRandomSource {
  bytes(size: number): Buffer;
}

export const INSTALL_CLOCK = Symbol('INSTALL_CLOCK');
export const INSTALL_RANDOM_SOURCE = Symbol('INSTALL_RANDOM_SOURCE');

export const systemInstallClock: InstallClock = { now: () => new Date() };

export const systemInstallRandomSource: InstallRandomSource = { bytes: (size) => randomBytes(size) };
