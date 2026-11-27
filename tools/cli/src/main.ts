#!/usr/bin/env node
// Nest's decorators read design-time metadata; the polyfill must load before any module that uses them.
import 'reflect-metadata';
import { homedir } from 'node:os';
import { SECRET_ENVIRONMENT_VARIABLES } from '@studio/core/secrets';
import { ExitCode } from './errors/exit-codes.js';
import { toErrorReport } from './errors/error-report.js';
import { resolveSystemLocale } from './i18n/locale.js';
import { setCliLocale } from './i18n/messages.js';
import { ConsolePrinter } from './output/printer.js';
import { runProgram } from './program/program.js';
import { readCliSettings } from './settings/cli-settings.js';

/**
 * The only place that reads `process.env` (once for the language, once into `CliSettings`) and the
 * single error boundary: every thrown error becomes one line on stderr, in the system language
 * (LC_ALL, LC_MESSAGES, LANG; pt-BR otherwise), and an exit code. Nothing here prints a key value;
 * `keyVariablesSet` holds variable names only.
 */
async function main(): Promise<number> {
  // First, so every text built after this (errors included) is in the system language.
  setCliLocale(resolveSystemLocale(process.env));
  const printer = new ConsolePrinter();
  const controller = new AbortController();
  let interrupts = 0;
  process.on('SIGINT', () => {
    interrupts += 1;
    // First Ctrl-C asks the running command to stop cleanly; a second one leaves immediately.
    if (interrupts === 1) controller.abort();
    else process.exit(ExitCode.interrupted);
  });
  try {
    const settings = readCliSettings(
      { environment: process.env, homeDirectory: homedir(), cliDirectory: import.meta.dirname },
      Object.values(SECRET_ENVIRONMENT_VARIABLES),
    );
    return await runProgram(process.argv.slice(2), { settings, printer, signal: controller.signal });
  } catch (error) {
    const report = toErrorReport(error);
    printer.error(report.message);
    return report.exitCode;
  }
}

process.exitCode = await main();
