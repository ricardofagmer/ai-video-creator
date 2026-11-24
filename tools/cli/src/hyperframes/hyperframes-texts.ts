import { HYPERFRAMES_CHROME_VERSION, HYPERFRAMES_PIN, type HyperframesEngineState } from '@studio/shared/hyperframes';
import { type ChromeMissingDetail, type HyperframesRuntimeFailure, type PinMismatchDetail } from '@studio/hyperframes';
import { cliText } from '../i18n/messages.js';
import { type HyperframesMessages } from '../i18n/messages/hyperframes.js';
import { type ProbedControlId } from './trace-controls.js';

/*
 * Texts of `studio hyperframes` (SPEC 0008 sections 5.5 to 5.7 and 7) in the active language,
 * read from the catalogue at call time. They carry states, versions and counts only: never a path,
 * a variable value or child output (K12).
 */

function hyperframesText(): HyperframesMessages {
  return cliText().hyperframes;
}

/** Section 5.7, the reason and what to do; `ready` has no refusal. */
export function engineStateReason(state: Exclude<HyperframesEngineState, 'ready'>): string {
  return hyperframesText().engineStates[state].reason;
}

export function engineStateNextStep(state: Exclude<HyperframesEngineState, 'ready'>): string {
  return hyperframesText().engineStates[state].next;
}

export function pinMismatchText(detail: PinMismatchDetail): string {
  const texts = hyperframesText();
  return texts.pinMismatch(HYPERFRAMES_PIN, texts.pinDetails[detail]);
}

export function chromeMissingText(detail: ChromeMissingDetail): string {
  const texts = hyperframesText();
  const describe: (version: string) => string = texts.chromeDetails[detail];
  return texts.chromeMissing(describe(HYPERFRAMES_CHROME_VERSION));
}

export function runtimeFailureText(reason: Exclude<HyperframesRuntimeFailure, 'pin-mismatch' | 'chrome-missing'>): string {
  return hyperframesText().runtimeFailures[reason];
}

/** Section 5.5: what `chrome install` announces before it asks for the typed version. */
export function chromeInstallNotice(destination: string): readonly string[] {
  return hyperframesText().chromeInstallNotice(HYPERFRAMES_CHROME_VERSION, destination);
}

/** Sections 5.6 and 17.9: what `trace` announces before it asks for the typed confirmation. */
export function traceNotice(): readonly string[] {
  return hyperframesText().traceNotice;
}

/** Section 17.9: a control the sandbox did not refuse fails the trace. */
export function traceControlNotRefusedText(control: ProbedControlId, exitCode: number): string {
  const findings = hyperframesText().findings;
  return findings.controlNotRefused(control, findings.controls[control], exitCode);
}

export function traceProbeFileRemovedText(): string {
  return hyperframesText().findings.probeFileRemoved;
}

export function traceChromeBeforeText(status: 'changed' | 'unreadable'): string {
  const findings = hyperframesText().findings;
  return status === 'changed' ? findings.chromeChangedBefore : findings.chromeUnreadableBefore;
}

export function traceChromeChangedAfterText(): string {
  return hyperframesText().findings.chromeChangedAfter;
}

export function traceChromeUnreadableAfterText(): string {
  return hyperframesText().findings.chromeUnreadableAfter;
}

/** C1 was refused with EPERM but macOS wrote no log line for it (section 18.7): shown, never part of the result. */
export function traceControlNotLoggedText(): string {
  return hyperframesText().findings.controlNotLogged;
}

/** A denial of another kind that no control caused: the profile working, shown without changing the result. */
export function traceInformationalDenialText(description: string): string {
  return hyperframesText().findings.informationalDenial(description);
}

/** The word the owner types to start the trace (`verificar` in pt-BR and es, `verify` in en). */
export function traceConfirmationWord(): string {
  return hyperframesText().traceConfirmationWord;
}
