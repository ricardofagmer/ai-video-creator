import { Module } from '@nestjs/common';
import { PrismaModule } from '@studio/core/prisma';
import { HealthController, HealthService } from './health.controller';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
