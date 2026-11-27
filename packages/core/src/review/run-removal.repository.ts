import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';

/** The database side of deleting a run: the outcome check and the run index row. */
@Injectable()
export class RunRemovalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async hasOutcome(runId: string): Promise<boolean> {
    return (await this.prisma.runOutcome.count({ where: { runId } })) > 0;
  }

  /** A run never indexed has no row; that is not an error. */
  async removeIndexRow(runId: string): Promise<void> {
    await this.prisma.runIndexEntry.deleteMany({ where: { id: runId } });
  }
}
