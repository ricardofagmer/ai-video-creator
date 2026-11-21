import { type SandboxDenial } from './hyperframes-ports.js';

/*
 * Reading the macOS sandbox denials out of `/usr/bin/log show --style ndjson` (SPEC 0008 section
 * 5.6 step 3). The kernel writes one line per denial, for example
 * `Sandbox: node(4242) deny(1) network-outbound 192.0.2.1:9`. Whether this predicate sees the
 * denials at all is proven by the control connection on every trace: an invisible control makes
 * the trace invalid, never passed.
 */

/** Kernel sandbox lines and the sandbox reporting subsystem; both carry the same text. */
export const SANDBOX_DENIAL_PREDICATE = '(sender == "Sandbox" OR subsystem == "com.apple.sandbox.reporting") AND eventMessage CONTAINS[c] "deny"';

const DENIAL_PATTERN = /Sandbox:\s+(.+?)\(\d+\)\s+deny\(\d+\)\s+(\S+)\s*(.*)$/;
const MAX_FIELD_CHARS = 120;

function eventMessageOf(line: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    // Header, footer or a partial line of the log tool: not an event.
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const message: unknown = Reflect.get(parsed, 'eventMessage');
  return typeof message === 'string' ? message : null;
}

function clip(text: string): string {
  return text.trim().slice(0, MAX_FIELD_CHARS);
}

/** Every distinct denial line in the ndjson output; the two log sources are deduplicated. */
export function parseSandboxDenials(ndjson: string): SandboxDenial[] {
  const seen = new Set<string>();
  const denials: SandboxDenial[] = [];
  for (const line of ndjson.split('\n')) {
    const message = eventMessageOf(line);
    if (message === null) continue;
    const match = DENIAL_PATTERN.exec(message);
    if (match === null) continue;
    const [, process = '', operation = '', target = ''] = match;
    const denial = { process: clip(process), operation: clip(operation), target: clip(target) };
    const key = `${denial.process}\u0000${denial.operation}\u0000${denial.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    denials.push(denial);
  }
  return denials;
}

export function isNetworkDenial(denial: SandboxDenial): boolean {
  return denial.operation.startsWith('network');
}

export function isFileDenial(denial: SandboxDenial): boolean {
  return denial.operation.startsWith('file-read') || denial.operation.startsWith('file-write');
}

export function isFileReadDenial(denial: SandboxDenial): boolean {
  return denial.operation.startsWith('file-read');
}

export function isProcessExecDenial(denial: SandboxDenial): boolean {
  return denial.operation.startsWith('process-exec');
}

/** True when the denial names `path`, allowing for the clip of a long target to its first characters. */
export function deniedTargetIs(denial: SandboxDenial, path: string): boolean {
  if (denial.target === path) return true;
  return denial.target.length === MAX_FIELD_CHARS && path.startsWith(denial.target);
}

export function describeDenial(denial: SandboxDenial): string {
  return `${denial.process} ${denial.operation} ${denial.target}`.trim();
}
