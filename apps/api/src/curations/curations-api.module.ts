import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CurationCostIndexSync } from './curation-cost-index.service';
import { CurationResponseAssembler } from './curation-response.assembler';
import { CurationsController } from './curations.controller';

/**
 * Http side of curations (SPEC 0005 C5-05). The request, decision, get and list handlers come from
 * core `CurationModule` and `IndexCurationCostCommand` from core `CostsModule`, both imported by the
 * root. No agent code is imported here (K1): the Curator runs only in the watcher.
 */
@Module({
  imports: [CqrsModule],
  controllers: [CurationsController],
  providers: [CurationResponseAssembler, CurationCostIndexSync],
})
export class CurationsApiModule {}
