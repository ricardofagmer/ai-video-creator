import { Module } from '@nestjs/common';
import { PathsModule } from '../paths/paths.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [PathsModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
