import { HealthResponseSchema } from '@studio/shared/api';
import { serviceState } from '../services/service-manager.js';
import { serviceSpec } from '../services/service-spec.js';
import { type CliSettings } from '../settings/cli-settings.js';
import { type DoctorCheck } from './doctor-check.js';
import { loopbackUrl, probeLoopback, type HttpProbe } from './http-probe.js';
import { probeToolVersion, probeWatcherAgent } from './system-probes.js';

const DOWN_REASONS: Readonly<Record<Extract<HttpProbe, { status: 'down' }>['reason'], string>> = {
  refused: 'nada responde',
  timeout: 'sem resposta no prazo',
  error: 'erro de conexão',
};

async function recordNote(settings: CliSettings, name: 'api' | 'web'): Promise<string> {
  const state = await serviceState(serviceSpec(name, settings, process.execPath));
  if (state.status === 'running') return ` (pid ${state.pid}, iniciado pelo studio)`;
  if (state.status === 'foreign-record') return ` (registro aponta para o pid ${state.pid}, que não é do studio)`;
  return '';
}

export async function checkApi(settings: CliSettings): Promise<DoctorCheck> {
  const label = 'api';
  const url = loopbackUrl(settings.ports.api, '/health');
  const probe = await probeLoopback(settings.ports.api, '/health');
  const note = await recordNote(settings, 'api');
  if (probe.status === 'down') return { label, status: 'failed', detail: `${url}: ${DOWN_REASONS[probe.reason]}${note}; use "studio start api".` };
  const health = HealthResponseSchema.safeParse(probe.body);
  if (probe.httpStatus !== 200 || !health.success) {
    return { label, status: 'failed', detail: `${url} respondeu HTTP ${probe.httpStatus}, mas não como a api do studio${note}.` };
  }
  if (health.data.status === 'degraded') {
    return { label, status: 'warning', detail: `${url} responde, mas o banco está ${health.data.database === 'ok' ? 'ok' : 'indisponível'}${note}.` };
  }
  return { label, status: 'ok', detail: `${url} saudável${note}.` };
}

export async function checkWeb(settings: CliSettings): Promise<DoctorCheck> {
  const label = 'web';
  const url = loopbackUrl(settings.ports.web, '/');
  const probe = await probeLoopback(settings.ports.web, '/');
  const note = await recordNote(settings, 'web');
  if (probe.status === 'down') return { label, status: 'failed', detail: `${url}: ${DOWN_REASONS[probe.reason]}${note}; use "studio start web".` };
  if (probe.httpStatus >= 500) return { label, status: 'failed', detail: `${url} respondeu HTTP ${probe.httpStatus}${note}.` };
  return { label, status: 'ok', detail: `${url} responde (HTTP ${probe.httpStatus})${note}.` };
}

/** The watcher is a launchd agent (A9); `doctor` only reads its state, never loads it (R1-22 does). */
export async function checkWatcher(settings: CliSettings): Promise<DoctorCheck> {
  const label = 'watcher';
  const uid = process.getuid?.() ?? -1;
  const state = await probeWatcherAgent(uid, settings.childEnvironment);
  switch (state.status) {
    case 'running':
      return { label, status: 'ok', detail: `agente launchd ativo (pid ${state.pid}).` };
    case 'loaded-not-running':
      return { label, status: 'warning', detail: 'agente launchd carregado, mas sem processo no momento.' };
    case 'not-loaded':
      return { label, status: 'failed', detail: 'agente launchd não carregado; rode a instalação de novo.' };
    case 'unknown':
      return { label, status: 'warning', detail: 'não foi possível consultar o launchctl.' };
  }
}

export async function checkTool(tool: 'ffmpeg' | 'ffprobe', settings: CliSettings): Promise<DoctorCheck> {
  const result = await probeToolVersion(tool, settings.childEnvironment);
  switch (result.status) {
    case 'found':
      return { label: tool, status: 'ok', detail: `versão ${result.version}.` };
    case 'missing':
      return { label: tool, status: 'failed', detail: 'não encontrado no PATH; instale com "brew install ffmpeg".' };
    case 'failed':
      return { label: tool, status: 'failed', detail: 'encontrado, mas falhou ao informar a versão.' };
  }
}
