import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { buildSandboxArgs, sandboxProfile } from '@studio/hyperframes';
import { runtimeFixture } from './hyperframes-runtime.fixtures.harness.test';

/*
 * The shipped render sandbox profile against the text of SPEC 0008 section 17.4 (rev 2, AC 86,
 * K15). The profile is only read as text: nothing here runs `sandbox-exec`. Rules are compared as
 * top-level forms with comments removed and white space collapsed, so a comment edit does not fail
 * a test but a changed, missing, added or reordered rule does (the last matching rule decides, U9).
 */

/** The seventeen `-D` parameters of section 17.5, in their frozen order. */
const SANDBOX_PARAMETER_NAMES: readonly string[] = [
  'OWNER_HYPERFRAMES_DIR',
  'OWNER_HOME',
  'STUDIO_ROOT',
  'DATA_HOME',
  'HF_ROOT',
  'HF_CONFIG_DIR',
  'HF_CACHE_DIR',
  'HF_HOME_DIR',
  'CHROME_DIR',
  'SCRATCH_DIR',
  'TEMPLATE_DIR',
  'NODE_BIN',
  'CHROME_BIN',
  'FFMPEG_BIN',
  'FFPROBE_BIN',
  'STUDIO_API_PORT',
  'STUDIO_WEB_PORT',
];

const PROFILE_HEADER: readonly string[] = ['(version 1)', '(allow default)'];

/** Rev 1 network rules, kept right after `(allow default)` (section 17.4). */
const REV1_NETWORK_RULES: readonly string[] = [
  '(deny network*)',
  '(allow network* (local ip "localhost:*"))',
  '(allow network* (remote ip "localhost:*"))',
  '(allow network* (remote unix-socket))',
  '(deny network* (remote unix-socket (path-literal "/private/var/run/mDNSResponder")))',
];

/** Rev 1 owner-folder rule, kept last so no rule above can reopen it. */
const REV1_OWNER_FOLDER_RULE = '(deny file-read* file-write* (subpath (param "OWNER_HYPERFRAMES_DIR")))';

/** Every rev 2 rule of section 17.4, in its order, each written as one normalized form. */
const REV2_RULES: readonly string[] = [
  '(deny network-outbound (remote ip (string-append "localhost:" (param "STUDIO_API_PORT"))))',
  '(deny network-outbound (remote ip (string-append "localhost:" (param "STUDIO_WEB_PORT"))))',
  '(deny network-outbound (remote unix-socket (subpath (param "OWNER_HOME"))))',
  '(deny network-outbound (remote unix-socket (path-literal "/private/var/run/docker.sock")))',
  String.raw`(deny network-outbound (remote unix-socket (regex #"^/private/tmp/com\.apple\.launchd\.[^/]+/")))`,
  '(allow network-outbound (remote unix-socket (subpath (param "SCRATCH_DIR"))))',
  '(allow network-outbound (remote unix-socket (subpath (param "HF_CACHE_DIR"))))',
  '(allow network-outbound (remote unix-socket (subpath (param "HF_HOME_DIR"))))',
  '(deny process-exec*)',
  '(allow process-exec* (literal (param "NODE_BIN")) (literal (param "CHROME_BIN")) (literal (param "FFMPEG_BIN")) (literal (param "FFPROBE_BIN")))',
  [
    '(deny mach-lookup',
    '(global-name "com.apple.coreservices.launchservicesd")',
    '(global-name "com.apple.lsd.open")',
    '(global-name "com.apple.lsd.mapdb")',
    '(global-name "com.apple.lsd.modifydb")',
    '(global-name "com.apple.coreservices.appleevents")',
    '(global-name "com.apple.nsurlsessiond")',
    '(global-name "com.apple.nsurlstorage-cache")',
    '(global-name "com.apple.cfnetwork.cfnetworkagent")',
    '(global-name "com.apple.SecurityServer")',
    '(global-name "com.apple.securityd.xpc"))',
  ].join(' '),
  '(deny appleevent-send)',
  '(deny file-write*)',
  [
    '(allow file-write*',
    '(subpath (param "SCRATCH_DIR"))',
    '(subpath (param "TEMPLATE_DIR"))',
    '(subpath (param "HF_CACHE_DIR"))',
    '(subpath (param "HF_CONFIG_DIR"))',
    '(subpath (param "HF_HOME_DIR"))',
    '(literal "/dev/null")',
    '(literal "/dev/zero")',
    '(literal "/dev/dtracehelper"))',
  ].join(' '),
  '(deny file-write* (subpath (param "CHROME_DIR")))',
  '(deny file-read* (subpath (string-append (param "OWNER_HOME") "/.ssh")))',
  '(deny file-read* (subpath (string-append (param "OWNER_HOME") "/Library/Keychains")))',
  '(deny file-read* (regex (string-append "^" (regex-quote (param "STUDIO_ROOT")) "/(.*/)?[.]env[^/]*$")))',
  '(deny file-read* (subpath (param "DATA_HOME")))',
  '(allow file-read-metadata (literal (param "DATA_HOME")))',
  '(allow file-read* (subpath (param "HF_ROOT")))',
];

function normalizedForm(form: string): string {
  return form.replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}

/** The text with every `;` comment removed; string and `#"…"` regex literals are kept whole. */
function withoutComments(text: string): string {
  let result = '';
  let index = 0;
  while (index < text.length) {
    const character = text.charAt(index);
    if (character === ';') {
      while (index < text.length && text.charAt(index) !== '\n') index += 1;
      continue;
    }
    if (character === '"') {
      const end = endOfString(text, index);
      result += text.slice(index, end);
      index = end;
      continue;
    }
    result += character;
    index += 1;
  }
  return result;
}

/** The index just past the string literal that opens at `start` (a backslash escapes one character). */
function endOfString(text: string, start: number): number {
  let index = start + 1;
  while (index < text.length) {
    const character = text.charAt(index);
    if (character === '\\') {
      index += 2;
      continue;
    }
    if (character === '"') return index + 1;
    index += 1;
  }
  return index;
}

/** The top-level forms of a comment-free profile, each normalized. */
function topLevelForms(text: string): string[] {
  const forms: string[] = [];
  let depth = 0;
  let start = 0;
  let index = 0;
  while (index < text.length) {
    const character = text.charAt(index);
    if (character === '"') {
      index = endOfString(text, index);
      continue;
    }
    if (character === '(') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) forms.push(normalizedForm(text.slice(start, index + 1)));
    }
    index += 1;
  }
  return forms;
}

async function profileText(): Promise<string> {
  return readFile(sandboxProfile().path, 'utf8');
}

async function profileForms(): Promise<string[]> {
  return topLevelForms(withoutComments(await profileText()));
}

function parameterNamesOf(text: string): Set<string> {
  return new Set([...text.matchAll(/\(param "([^"]+)"\)/g)].map((match) => match[1] ?? ''));
}

describe('render.sb rev 2 profile text (AC 86, K15)', () => {
  it('opens with (version 1) and (allow default), then the five rev 1 network rules in their order', async () => {
    const forms = await profileForms();

    assert.deepEqual(forms.slice(0, PROFILE_HEADER.length + REV1_NETWORK_RULES.length), [...PROFILE_HEADER, ...REV1_NETWORK_RULES]);
  });

  it('holds every rev 2 rule group of section 17.4, in order, between the rev 1 network rules and the last rule', async () => {
    const forms = await profileForms();

    const rev2Forms = forms.slice(PROFILE_HEADER.length + REV1_NETWORK_RULES.length, -1);

    assert.deepEqual(rev2Forms, REV2_RULES);
  });

  it('ends with the OWNER_HYPERFRAMES_DIR read and write deny as its last rule', async () => {
    const forms = await profileForms();

    assert.equal(forms.at(-1), REV1_OWNER_FOLDER_RULE);
  });

  it('writes no owner folder under /Users/ anywhere in the file', async () => {
    const text = await profileText();

    assert.equal(text.includes('/Users/'), false);
  });

  it('writes neither studio port number, 4310 nor 4311, anywhere in the file', async () => {
    const text = await profileText();

    assert.equal(text.includes('4310'), false);
    assert.equal(text.includes('4311'), false);
  });

  it('uses exactly the seventeen (param "…") names of section 17.5', async () => {
    const text = withoutComments(await profileText());

    const names = parameterNamesOf(text);

    assert.deepEqual([...names].sort(), [...SANDBOX_PARAMETER_NAMES].sort());
  });

  it('uses exactly the parameter names that buildSandboxArgs passes as -D pairs', async () => {
    const text = withoutComments(await profileText());
    const args = buildSandboxArgs({ templateDir: '/fixture/scratch/render-0001/staged-template', runtime: runtimeFixture() });

    const passedNames = args.filter((_, index) => args[index - 1] === '-D').map((pair) => pair.slice(0, pair.indexOf('=')));

    assert.deepEqual(passedNames, SANDBOX_PARAMETER_NAMES);
    assert.deepEqual([...parameterNamesOf(text)].sort(), [...passedNames].sort());
  });
});
