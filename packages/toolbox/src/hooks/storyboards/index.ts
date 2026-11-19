import type { Storyboard } from '../storyboard';
import { c01GitGuard } from './c01-git-guard';
import { introEngineOs } from './intro';

/** Storyboards `ace hook <id>` can build; each id needs matching compositions in @ace/video. */
export const storyboards: Readonly<Record<string, Storyboard>> = { c01: c01GitGuard, intro: introEngineOs };
