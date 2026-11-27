import { locateMediaTool } from '@studio/core/runtime';
import { HealthResponseSchema } from '@studio/shared/api';
import { cliText } from '../i18n/messages.js';
import { serviceState } from '../services/service-manager.js';
import { serviceSpec } from '../services/service-spec.js';
import { type CliSettings } from '../settings/cli-settings.js';
import { type DoctorCheck } from './doctor-check.js';
import { loopbackUrl, probeLoopback, type HttpProbe } from './http-probe.js';
import { probeNodeVersion, probeToolVersion, probeWatcherAgent } from './system-probes.js';

function downReason(reason: Extract<HttpProbe, { status: 'down' }>['reason']): string {
  return cliText().doctor.services.down[reason];
}

async function recordNote(settings: CliSettings, name: 'api' | 'web'): Promise<string> {
  const text = cliText().doctor.services;
  const state = await serviceState(serviceSpec(name, settings, process.execPath));
  if (state.status === 'running') return text.startedByStudio(state.pid);
  if (state.status === 'foreign-record') return text.foreignRecord(state.pid);
  return '';
}

export async function checkApi(settings: CliSettings): Promise<DoctorCheck> {
  const label = 'api';
  const url = loopbackUrl(settings.ports.api, '/health');
  const probe = await probeLoopback(settings.ports.api, '/health');
  const note = await recordNote(settings, 'api');
  const text = cliText().doctor.services;
  if (probe.status === 'down') return { label, status: 'failed', detail: text.downDetail(url, downReason(probe.reason), note, 'api') };
  const health = HealthResponseSchema.safeParse(probe.body);
  if (probe.httpStatus !== 200 || !health.success) return { label, status: 'failed', detail: text.notStudioApi(url, probe.httpStatus, note) };
  if (health.data.status === 'degraded') return { label, status: 'warning', detail: text.degraded(url, health.data.database === 'ok', note) };
  return { label, status: 'ok', detail: text.healthy(url, note) };
}

export async function checkWeb(settings: CliSettings): Promise<DoctorCheck> {
  const label = 'web';
  const url = loopbackUrl(settings.ports.web, '/');
  const probe = await probeLoopback(settings.ports.web, '/');
  const note = await recordNote(settings, 'web');
  const text = cliText().doctor.services;
  if (probe.status === 'down') return { label, status: 'failed', detail: text.downDetail(url, downReason(probe.reason), note, 'web') };
  if (probe.httpStatus >= 500) return { label, status: 'failed', detail: text.webError(url, probe.httpStatus, note) };
  return { label, status: 'ok', detail: text.webUp(url, probe.httpStatus, note) };
}

/** The watcher is a launchd agent (A9); `doctor` only reads its state, never loads it (R1-22 does). */
export async function checkWatcher(settings: CliSettings): Promise<DoctorCheck> {
  const label = 'watcher';
  const uid = process.getuid?.() ?? -1;
  const state = await probeWatcherAgent(uid, settings.childEnvironment);
  const text = cliText().doctor.services;
  switch (state.status) {
    case 'running':
      return { label, status: 'ok', detail: text.watcherRunning(state.pid) };
    case 'loaded-not-running':
      return { label, status: 'warning', detail: text.watcherLoaded };
    case 'not-loaded':
      return { label, status: 'failed', detail: text.watcherNotLoaded };
    case 'unknown':
      return { label, status: 'warning', detail: text.watcherUnknown };
  }
}

/**
 * Development mode probes the bare name on the child PATH, as before; packaged mode probes the
 * bundled binary by absolute path and says so (plan C3 rev 2), so a Homebrew ffmpeg on the PATH can
 * never stand in for a missing bundled one.
 */
export async function checkTool(tool: 'ffmpeg' | 'ffprobe', settings: CliSettings): Promise<DoctorCheck> {
  const location = locateMediaTool(settings.runtime, tool);
  const bundled = location.source === 'bundled';
  const result = await probeToolVersion(tool, settings.childEnvironment, bundled ? location.path : location.name);
  const text = cliText().doctor.services;
  switch (result.status) {
    case 'found': {
      const version = result.version ?? text.toolVersionUnknown;
      return { label: tool, status: 'ok', detail: bundled ? text.bundledToolVersion(version) : text.toolVersion(version) };
    }
    case 'missing':
      return { label: tool, status: 'failed', detail: bundled ? text.bundledToolMissing : text.toolMissing };
    case 'failed':
      return { label: tool, status: 'failed', detail: text.toolFailed };
  }
}

/**
 * The node that runs the studio's services and children. Development reports this CLI's own node,
 * which is the one `studio start` uses; packaged mode runs the bundled `node/bin/node` by absolute
 * path, so a missing or broken bundled node fails here before any service start does.
 */
export async function checkNode(settings: CliSettings): Promise<DoctorCheck> {
  const label = 'node';
  const text = cliText().doctor.services;
  if (settings.runtime.mode === 'development') return { label, status: 'ok', detail: text.runningNode(process.version) };
  const result = await probeNodeVersion(settings.runtime.nodeBinary, settings.childEnvironment);
  switch (result.status) {
    case 'found':
      return { label, status: 'ok', detail: text.bundledToolVersion(result.version ?? text.toolVersionUnknown) };
    case 'missing':
      return { label, status: 'failed', detail: text.bundledToolMissing };
    case 'failed':
      return { label, status: 'failed', detail: text.toolFailed };
  }
}
