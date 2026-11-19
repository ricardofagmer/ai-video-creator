import { type CuratorTaskPacket } from '@studio/shared/curation';
import { curatorPrompt } from '../prompts/curator.prompt';

/**
 * Characters the second call's correction may add to the prompt: at most 10 issues of 300
 * characters plus the fixed correction sentences (`renderCuratorCorrection`). Added to the
 * worst-case input of call 2 so the estimate stays an over-estimate (B7).
 */
const CORRECTION_ALLOWANCE_CHARS = 4_000;

/**
 * Prompt characters of one Curator call, over-estimated (B7): the cached instructions, the packet
 * JSON as the agent indents it (the body counted inside it and again as its own block), and, for
 * call 2, the largest correction the schema allows. The watcher prices it before each call
 * (`decideCuratorCallBudget`), and the agent records the same price for a live request that was
 * sent but whose usage never came back.
 */
export function worstCaseInputChars(packet: CuratorTaskPacket, withCorrection: boolean): number {
  const packetChars = JSON.stringify(packet, null, 1).length + packet.inputs.subject.body.length;
  return curatorPrompt.system.length + packetChars + (withCorrection ? CORRECTION_ALLOWANCE_CHARS : 0);
}
