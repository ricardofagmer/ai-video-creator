import type { RunFile } from '@studio/shared/ace';

/** The wizard's next action for a run, printed in every command's final JSON line. */
export function nextStepFor(run: RunFile): string {
  const id = run.runId;
  switch (run.state) {
    case 'RESEARCH':
      return run.manifestHashes.research === undefined
        ? `write research.json (fagmer-video-trend-research) then run ace validate ${id} research`
        : `write claims.json (fagmer-video-fact-check) then run ace validate ${id} verify`;
    case 'VERIFIED':
      return `write script.json (fagmer-video-script) then run ace validate ${id} script`;
    case 'SCRIPTED':
      return `run ace capture ${id}`;
    case 'ASSETS_READY':
      return `run ace narrate ${id}`;
    case 'NARRATED':
      return `run ace render ${id}`;
    case 'RENDERED':
      return `write editorial.json (fagmer-video-quality-gate) then run ace qa ${id}`;
    case 'QA_PASSED':
      return `run ace qa ${id} to finish moving the run to REVIEW`;
    case 'REVIEW':
      return `run ace preview ${id}, publish the review page (fagmer-video-publish-review), then ace approve ${id} --decision APPROVED|REJECTED --reviewer <name> --checklist <8 items>`;
    case 'APPROVED':
      return 'approved; nothing was posted. Post manually in TikTok Studio';
    case 'REJECTED':
      return 'rejected; start a new run with ace init';
    case 'PUBLISHED':
    case 'ANALYZED':
      return 'analytics loop is R3 (ace metrics)';
    case 'FAILED':
      return `fix the cause (${run.stateReason ?? 'see stderr'}) then run ace retry ${id}`;
    case 'BLOCKED':
      return `blocked (${run.stateReason ?? 'see stderr'}); BLOCKED is terminal, start a new run with ace init`;
  }
}
