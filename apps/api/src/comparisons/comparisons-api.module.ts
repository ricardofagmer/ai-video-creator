import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { RunsApiModule } from '../runs/runs-api.module';
import { ComparisonResponseAssembler } from './comparison-response.assembler';
import { ComparisonsController } from './comparisons.controller';

/**
 * Http side of comparisons; the handlers come from core `ComparisonsModule`, imported by the root.
 * `RunsApiModule` supplies the rev 4 artifact rule for each arm.
 */
@Module({
  imports: [CqrsModule, RunsApiModule],
  controllers: [ComparisonsController],
  providers: [ComparisonResponseAssembler],
})
export class ComparisonsApiModule {}
