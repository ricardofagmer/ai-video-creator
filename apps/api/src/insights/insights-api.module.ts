import { Module } from '@nestjs/common';
import { InsightsController } from './insights.controller';

/** Http side of studio insights (PRD 0001 R4 goal 4); the query handler lives in `InsightsModule`. */
@Module({
  controllers: [InsightsController],
})
export class InsightsApiModule {}
