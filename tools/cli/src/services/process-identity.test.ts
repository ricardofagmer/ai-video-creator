import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isLaunchedProcess, isLaunchedService } from './process-identity.js';

/*
 * docs/specs/2026-11-24-installer-upgrade-guards-design.md, gap 1: the packaged entry file sits
 * under "EngineOS Video Creator.app", so its path holds spaces. Split on whitespace it was never
 * found in the `ps` command line, and `studio stop` judged every packaged API foreign.
 */

const PACKAGED_NODE = '/Applications/EngineOS Video Creator.app/Contents/Resources/runtime/node/bin/node';
const PACKAGED_ENTRY = '/Applications/EngineOS Video Creator.app/Contents/Resources/runtime/payload/api/dist/main.js';
const CHECKOUT_ENTRY = '/Users/owner/video-studio/apps/api/dist/main.js';

describe('service identity: command line runs the entry file', () => {
  it('recognises an entry path that holds spaces', () => {
    assert.equal(isLaunchedProcess(`${PACKAGED_NODE} ${PACKAGED_ENTRY}`, PACKAGED_ENTRY), true);
  });

  it('recognises a path without spaces, with arguments after it', () => {
    const next = '/Users/owner/video-studio/apps/web/node_modules/next/dist/bin/next';
    assert.equal(isLaunchedProcess(`/opt/homebrew/bin/node ${next} start --hostname 127.0.0.1 --port 4310`, next), true);
    assert.equal(isLaunchedProcess(`/opt/homebrew/bin/node ${CHECKOUT_ENTRY}`, CHECKOUT_ENTRY), true);
  });

  it('recognises the entry file as the whole command line', () => {
    assert.equal(isLaunchedProcess(PACKAGED_ENTRY, PACKAGED_ENTRY), true);
  });

  it('refuses a longer path that only contains the entry path', () => {
    assert.equal(isLaunchedProcess(`${PACKAGED_NODE} ${PACKAGED_ENTRY}.bak`, PACKAGED_ENTRY), false);
    assert.equal(isLaunchedProcess(`${PACKAGED_NODE} /Volumes/Backup${PACKAGED_ENTRY}`, PACKAGED_ENTRY), false);
  });

  it('finds a whole-argument match after an earlier partial one', () => {
    assert.equal(isLaunchedProcess(`/bin/cat /tmp${CHECKOUT_ENTRY} ${CHECKOUT_ENTRY}`, CHECKOUT_ENTRY), true);
  });

  it('refuses another copy, an unrelated process and an empty entry path', () => {
    const trashed = '/Users/owner/.Trash/EngineOS Video Creator.app/Contents/Resources/runtime/payload/api/dist/main.js';
    assert.equal(isLaunchedProcess(`${PACKAGED_NODE} ${trashed}`, PACKAGED_ENTRY), false);
    assert.equal(isLaunchedProcess('/usr/bin/vim notes.txt', PACKAGED_ENTRY), false);
    assert.equal(isLaunchedProcess(`${PACKAGED_NODE} ${PACKAGED_ENTRY}`, ''), false);
  });
});

describe('service identity: renamed process title', () => {
  const environment = { PATH: '/usr/bin:/bin' };

  it('accepts a matching command line without asking who listens on the port', async () => {
    const check = { pid: 1, commandLine: `${PACKAGED_NODE} ${PACKAGED_ENTRY}`, entryPath: PACKAGED_ENTRY, port: 4311, environment };
    assert.equal(await isLaunchedService(check), true);
  });

  it('refuses a foreign command line when the service has no renamed title', async () => {
    const check = { pid: 1, commandLine: '/usr/bin/vim notes.txt', entryPath: PACKAGED_ENTRY, port: 4311, environment };
    assert.equal(await isLaunchedService(check), false);
  });

  it('refuses a title that does not start with the expected prefix', async () => {
    const check = { pid: 1, commandLine: '/usr/bin/vim notes.txt', entryPath: PACKAGED_ENTRY, port: 4310, processTitlePrefix: 'next-server (v', environment };
    assert.equal(await isLaunchedService(check), false);
  });
});
