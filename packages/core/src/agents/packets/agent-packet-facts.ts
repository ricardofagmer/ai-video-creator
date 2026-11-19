import { DIRECT_SCENES_TASK, WRITE_SCRIPT_TASK, type AgentPacket, type ModelRoleName } from '@studio/shared/agents';
import { type AssetRef, type LearningNoteId } from '@studio/shared/catalog';

/** The asset refs a director packet offers; other packets offer none. */
export function packetRefsOf(packet: AgentPacket<ModelRoleName>): AssetRef[] {
  return packet.task === DIRECT_SCENES_TASK ? packet.inputs.offeredRefs.map((binding) => binding.ref) : [];
}

/** SPEC 0005 section 5.6: the end line of a writer or director session names the notes it carried. */
export function packetNoteIdsOf(packet: AgentPacket<ModelRoleName>): LearningNoteId[] | undefined {
  if (packet.task !== WRITE_SCRIPT_TASK && packet.task !== DIRECT_SCENES_TASK) return undefined;
  return packet.inputs.learnings.map((note) => note.noteId);
}
