import { DEFAULT_CLI_LOCALE, type CliLocale } from './locale.js';
import { commandsEn, commandsEs, commandsPtBR } from './messages/commands.js';
import { doctorEn, doctorEs, doctorPtBR } from './messages/doctor.js';
import { errorsEn, errorsEs, errorsPtBR } from './messages/errors.js';
import { hyperframesEn, hyperframesEs, hyperframesPtBR } from './messages/hyperframes.js';
import { metricsEn, metricsEs, metricsPtBR } from './messages/metrics.js';
import { platformsEn, platformsEs, platformsPtBR } from './messages/platforms.js';
import { programEn, programEs, programPtBR } from './messages/program.js';
import { runsEn, runsEs, runsPtBR } from './messages/runs.js';
import { schedulesEn, schedulesEs, schedulesPtBR } from './messages/schedules.js';
import { tracesEn, tracesEs, tracesPtBR } from './messages/traces.js';
import { usageEn, usageEs, usagePtBR } from './messages/usage.js';
import { type Messages } from './message-types.js';

const cliPtBR = {
  commands: commandsPtBR,
  doctor: doctorPtBR,
  errors: errorsPtBR,
  hyperframes: hyperframesPtBR,
  metrics: metricsPtBR,
  platforms: platformsPtBR,
  program: programPtBR,
  runs: runsPtBR,
  schedules: schedulesPtBR,
  traces: tracesPtBR,
  usage: usagePtBR,
} as const;

/** Every locale has every key of the pt-BR catalogue; a missing one fails `typecheck`. */
export type CliMessages = Messages<typeof cliPtBR>;

export const cliMessages: Readonly<Record<CliLocale, CliMessages>> = {
  'pt-BR': cliPtBR,
  es: {
    commands: commandsEs,
    doctor: doctorEs,
    errors: errorsEs,
    hyperframes: hyperframesEs,
    metrics: metricsEs,
    platforms: platformsEs,
    program: programEs,
    runs: runsEs,
    schedules: schedulesEs,
    traces: tracesEs,
    usage: usageEs,
  },
  en: {
    commands: commandsEn,
    doctor: doctorEn,
    errors: errorsEn,
    hyperframes: hyperframesEn,
    metrics: metricsEn,
    platforms: platformsEn,
    program: programEn,
    runs: runsEn,
    schedules: schedulesEn,
    traces: tracesEn,
    usage: usageEn,
  },
};

/*
 * The active language of this process. `main` sets it once from the system locale before anything
 * else runs; tests that never set it get pt-BR. A short-lived single-process CLI makes a module
 * value enough. Texts are read at call time (never at module load), so they follow it.
 */
let activeLocale: CliLocale = DEFAULT_CLI_LOCALE;

export function setCliLocale(locale: CliLocale): void {
  activeLocale = locale;
}

export function cliLocale(): CliLocale {
  return activeLocale;
}

/** The catalogue of the active language. */
export function cliText(): CliMessages {
  return cliMessages[activeLocale];
}
