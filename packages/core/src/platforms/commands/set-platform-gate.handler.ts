import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type PlatformView } from '@studio/shared/api';
import { applyGateChange } from '@studio/shared/platforms';
import { writeGatesFile } from '@studio/shared/platforms/files';
import { PlatformRefusedError } from '../platforms.errors';
import { SetPlatformGateInputSchema, parsePlatformInput } from '../platforms.input';
import { PLATFORM_CLOCK, PLATFORM_FILE_ROOT, type PlatformClock } from '../platform-runtime';
import { PlatformViewReader } from '../platform-view.reader';
import { PlatformWriteQueue } from '../platform-write.queue';
import { GateStore } from '../stores/platform-file.stores';
import { SetPlatformGateCommand } from './platform.commands';

/**
 * SPEC 0007 section 5.3: only the owner turns a capability on or off; the studio never flips a gate
 * itself. Enabling `publish` where the platform does not support it (Instagram, OD8) answers
 * `platform-publish-unsupported` and writes nothing. A change already in effect writes nothing.
 */
@CommandHandler(SetPlatformGateCommand)
export class SetPlatformGateHandler implements ICommandHandler<SetPlatformGateCommand, PlatformView> {
  private readonly logger = new Logger(SetPlatformGateHandler.name);

  constructor(
    @Inject(PLATFORM_FILE_ROOT) private readonly platformRoot: string,
    @Inject(PLATFORM_CLOCK) private readonly clock: PlatformClock,
    private readonly gates: GateStore,
    private readonly views: PlatformViewReader,
    private readonly queue: PlatformWriteQueue,
  ) {}

  async execute(command: SetPlatformGateCommand): Promise<PlatformView> {
    const input = parsePlatformInput(SetPlatformGateInputSchema, command.input);
    const { platform, change, updatedBy, correlationId } = input;
    await this.queue.exclusive(async () => {
      const all = await this.gates.readAll();
      const current = all[platform];
      const result = applyGateChange({ platform, gates: current, capability: change.capability, state: change.state });
      if (result.status === 'refused') {
        this.logger.log({ event: 'platform.gate-refused', platform, capability: change.capability, reason: result.reason, correlationId });
        throw new PlatformRefusedError(result.reason, platform);
      }
      if (current[change.capability] === change.state) return;
      await writeGatesFile(this.platformRoot, {
        format: 1,
        gates: { ...all, [platform]: result.gates },
        updatedAt: this.clock.now().toISOString(),
        updatedBy,
      });
      this.logger.log({ event: 'platform.gate-changed', platform, capability: change.capability, state: change.state, correlationId });
    });
    return this.views.viewOf(platform);
  }
}
