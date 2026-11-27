import { isAbsolute, normalize } from 'node:path';
import { runtimeSearchPath } from '@studio/core/runtime';
import { PACKAGED_BASE_PATH, type SetupContext } from './setup-context';
import { WATCHER_PLIST_TEMPLATE } from './watcher-plist-template';

/*
 * The packaged watcher plist, rendered in memory from the template embedded in the shell bundle
 * (plan section 5 step 6). Every value is checked and XML-escaped before it enters the document; a
 * render with a placeholder left over is refused, as install.sh's render_plist refuses it.
 */

export type PlistRender = { readonly kind: 'rendered'; readonly text: string } | { readonly kind: 'invalid' };

const MIN_PORT = 1024;
const MAX_PORT = 65535;
const LEFTOVER_PLACEHOLDER = /__[A-Z_]+__/;
/** Control characters are not valid XML 1.0 text and never belong in a path or a version. */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const SEMVER_LIKE = /^[0-9A-Za-z.+-]{1,64}$/;

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function isPlistPath(value: string): boolean {
  return isAbsolute(value) && normalize(value) === value && !CONTROL_CHARACTER.test(value);
}

function isPort(value: number): boolean {
  return Number.isSafeInteger(value) && value >= MIN_PORT && value <= MAX_PORT;
}

/** Placeholder name to raw value; null when a value is not fit for the plist. */
function placeholderValues(context: SetupContext): ReadonlyMap<string, string> | null {
  const { paths, ports, appVersion } = context;
  const searchPath = runtimeSearchPath(paths.runtime, PACKAGED_BASE_PATH);
  const pathValues: ReadonlyArray<readonly [string, string]> = [
    ['__NODE_BIN__', paths.runtime.nodeBinary],
    ['__WATCHER_MAIN__', paths.watcherMain],
    ['__WORKING_DIR__', paths.runtime.payload.watcher],
    ['__LOGS_DIR__', paths.dataHome.logs],
    ['__RUNTIME_DIR__', paths.runtime.root],
  ];
  if (!pathValues.every(([, value]) => isPlistPath(value))) return null;
  // The version sits inside an XML comment, where `--` is not allowed.
  const versionFits = SEMVER_LIKE.test(appVersion) && !appVersion.includes('--');
  if (!isPort(ports.api) || !isPort(ports.web) || !versionFits || CONTROL_CHARACTER.test(searchPath)) return null;
  return new Map<string, string>([
    ...pathValues,
    ['__API_PORT__', String(ports.api)],
    ['__WEB_PORT__', String(ports.web)],
    ['__PATH__', searchPath],
    ['__APP_VERSION__', appVersion],
  ]);
}

/**
 * The plist text for this app copy. It names the app version, so an upgrade (or a moved app, whose
 * paths change) produces different text, which is what makes the watcher-agent step re-render the
 * file and restart the agent (DI-AC-05).
 */
export function renderWatcherPlist(context: SetupContext): PlistRender {
  const values = placeholderValues(context);
  if (values === null) return { kind: 'invalid' };
  let text = WATCHER_PLIST_TEMPLATE;
  for (const [placeholder, value] of values) {
    text = text.split(placeholder).join(escapeXml(value));
  }
  return LEFTOVER_PLACEHOLDER.test(text) ? { kind: 'invalid' } : { kind: 'rendered', text };
}
