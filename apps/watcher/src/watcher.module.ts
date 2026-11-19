import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { boundAssetsPreflightProvider } from './adapters/preflight/bound-assets.preflight-check';
import { WATCHER_SHUTDOWN } from './engine/control/watcher-shutdown';
import { EngineModule } from './engine/engine.module';
import { WatcherPortsModule, type PortSelection } from './watcher-ports.module';

export interface WatcherModuleOptions {
  ports: PortSelection;
  /**
   * Daemon only (R1-09): process shutdown signal, bound to the engine's optional
   * `WATCHER_SHUTDOWN` seam. When it fires, the in-flight step's `AbortSignal` aborts and the run is
   * left `running` for crash-resume (criterion 13); an owner `stop` keeps its `interrupted`
   * behaviour. Absent (dev fixture): the engine never sees a shutdown.
   */
  shutdown?: AbortSignal;
}

/**
 * Engine seams the options add, listed after the `EngineModule` defaults so they win. With the
 * real catalog, `preflight` also runs the R1-06 presence check over the engine's own resolution;
 * the engine's built-in preflight is the only re-hash of every bound asset. The mock fixture keeps
 * the engine defaults.
 */
function engineSeams(options: WatcherModuleOptions): Provider[] {
  const preflight = options.ports.kind === 'catalog' ? [boundAssetsPreflightProvider] : [];
  return options.shutdown === undefined ? preflight : [...preflight, { provide: WATCHER_SHUTDOWN, useValue: options.shutdown }];
}

/**
 * Engine composition of the watcher process (standalone Nest application context, no HTTP). It
 * binds the ports and the option seams only: R1-08's recovery policy is the `EngineModule` default.
 * It re-exports the engine module, so `RunEngine` is injectable by the R1-09 daemon loop
 * (`src/daemon/watcher-daemon.module.ts`) and resolvable by the dev fixture. It also re-exports the
 * one ports module the engine imports (the same object, so the same instances), so the daemon's
 * heartbeat writer reads the engine's `CLOCK` instead of binding a second clock (rev 4, 13.3).
 */
@Module({})
export class WatcherModule {
  static register(options: WatcherModuleOptions): DynamicModule {
    const ports = WatcherPortsModule.register(options.ports);
    const engine = EngineModule.register({ ports, seams: engineSeams(options) });
    return {
      module: WatcherModule,
      imports: [engine, ports],
      exports: [engine, ports],
    };
  }
}
