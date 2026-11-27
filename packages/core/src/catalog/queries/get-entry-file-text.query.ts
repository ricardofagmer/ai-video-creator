import { Query } from '@nestjs/cqrs';
import { type EntryFileText } from '../skill-entry-file';

/** The entry file (SKILL.md) of a skill version as UTF-8 text (skills spec addendum T5). */
export class GetEntryFileTextQuery extends Query<EntryFileText> {
  /** C1 `AssetRef`; validated by the handler. */
  constructor(
    readonly ref: string,
    readonly signal?: AbortSignal,
  ) {
    super();
  }
}
