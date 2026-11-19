import {
  DIRECTOR_ROLE,
  EVALUATOR_ROLE,
  PLANNER_ROLE,
  RECOVERY_ROLE,
  WRITER_ROLE,
  type AgentPacket,
  type ModelRoleName,
} from '@studio/shared/agents';
import { directorPrompt } from './director.prompt';
import { plannerPrompt } from './planner.prompt';
import { type RolePrompt } from './prompt-common';
import { recoveryPrompt } from './recovery.prompt';
import { reviewerPrompt } from './reviewer.prompt';
import { writerPrompt } from './writer.prompt';

export { schemaFeedbackSection } from './prompt-common';

type RolePrompts = { [Role in ModelRoleName]: RolePrompt<AgentPacket<Role>> };

/** One versioned prompt per role (topology section 2). */
export const rolePrompts: RolePrompts = {
  [PLANNER_ROLE]: plannerPrompt,
  [WRITER_ROLE]: writerPrompt,
  [DIRECTOR_ROLE]: directorPrompt,
  [EVALUATOR_ROLE]: reviewerPrompt,
  [RECOVERY_ROLE]: recoveryPrompt,
};
