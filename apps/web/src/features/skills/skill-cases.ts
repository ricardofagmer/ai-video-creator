/**
 * Real cases on the skill cards. Each one retells what a skill's stage did in one recorded AI Creator
 * Engine run (`ai-creator-engine/runs/<SKILL_CASE_RUN_ID>/`); the numbers in the texts
 * (`messages/skills/*`, group `cases.items`) are read from that run's manifests, not invented. A
 * skill with no recorded run has no case, and its card says so.
 */
export const SKILL_CASE_RUN_ID = '2026-11-16-s1-mock-smoke-test-automate-meeting-notes';

export const skillCaseIds = [
  'fagmer-video-producer',
  'fagmer-video-trend-research',
  'fagmer-video-fact-check',
  'fagmer-video-script',
  'fagmer-video-scene-generator',
  'fagmer-video-voiceover',
  'fagmer-video-tiktok-render',
  'fagmer-video-quality-gate',
  'fagmer-video-seo-package',
] as const;
export type SkillCaseId = (typeof skillCaseIds)[number];

/** What a case tells: what was asked, what the skill did, what came out. */
export interface SkillCaseTexts {
  request: string;
  steps: string[];
  result: string;
}

const caseIdSet: ReadonlySet<string> = new Set(skillCaseIds);

function isSkillCaseId(value: string): value is SkillCaseId {
  return caseIdSet.has(value);
}

/** The case of a catalog skill, by its asset id; null when no run was recorded for it. */
export function skillCaseIdOf(assetId: string): SkillCaseId | null {
  return isSkillCaseId(assetId) ? assetId : null;
}
