import {
  ScriptManifestSchema,
  runFiles,
  videoSpec,
  type ClaimManifest,
  type ResearchManifest,
  type ScriptManifest,
  type TemplateId,
} from '@studio/shared/ace';
import { isClaimSupported, researchSourceUrls } from './claims-rules';
import { countWords, normalizeWhitespace } from './text';
import { issueToViolation, type Violation } from './violations';

/** Scene ids become asset file names, so they must be file-name safe. */
const SCENE_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

export interface ScriptCheckInput {
  research: ResearchManifest;
  claims: ClaimManifest;
  template: TemplateId;
}

export interface ScriptCheck {
  manifest: ScriptManifest | null;
  violations: Violation[];
}

function checkNarration(script: ScriptManifest): Violation[] {
  const violations: Violation[] = [];
  const actualWords = countWords(script.narration);
  if (script.wordCount !== actualWords) {
    violations.push({ code: 'INVALID_INPUT', message: `wordCount is ${script.wordCount} but narration has ${actualWords} words` });
  }
  if (actualWords < videoSpec.narrationMinWords || actualWords > videoSpec.narrationMaxWords) {
    violations.push({
      code: 'NARRATION_LENGTH',
      message: `narration has ${actualWords} words; it must be ${videoSpec.narrationMinWords}-${videoSpec.narrationMaxWords}`,
    });
  }
  const joined = normalizeWhitespace(script.scenes.map((scene) => scene.narration).join(' '));
  if (joined !== normalizeWhitespace(script.narration)) {
    violations.push({ code: 'INVALID_INPUT', message: 'narration must equal the scenes\' narration joined in order' });
  }
  return violations;
}

function checkScenes(script: ScriptManifest, input: ScriptCheckInput): Violation[] {
  const violations: Violation[] = [];
  const sourceUrls = researchSourceUrls(input.research);
  const claimsById = new Map(input.claims.claims.map((claim) => [claim.id, claim]));
  const seenIds = new Set<string>();
  for (const scene of script.scenes) {
    if (!SCENE_ID_PATTERN.test(scene.id)) {
      violations.push({ code: 'INVALID_INPUT', message: `scene id "${scene.id}" may only use letters, digits, "-" and "_"` });
    }
    if (seenIds.has(scene.id)) violations.push({ code: 'INVALID_INPUT', message: `scene id "${scene.id}" is used twice` });
    seenIds.add(scene.id);
    for (const claimId of scene.claimIds) {
      const claim = claimsById.get(claimId);
      if (!claim) {
        violations.push({ code: 'UNSUPPORTED_CLAIM', message: `scene "${scene.id}" cites unknown claim "${claimId}"` });
      } else if (!isClaimSupported(claim, sourceUrls)) {
        violations.push({ code: 'UNSUPPORTED_CLAIM', message: `scene "${scene.id}" cites unsupported claim "${claimId}"` });
      }
    }
  }
  return violations;
}

/** script.json: schema, template, word count and range, narration consistency, cited claims. */
export function checkScript(raw: unknown, input: ScriptCheckInput): ScriptCheck {
  const parsed = ScriptManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { manifest: null, violations: parsed.error.issues.map((issue) => issueToViolation(runFiles.script, issue)) };
  }
  const script = parsed.data;
  const violations: Violation[] = [];
  if (script.template !== input.template) {
    violations.push({ code: 'INVALID_INPUT', message: `template is ${script.template} but the run was created with ${input.template}` });
  }
  violations.push(...checkNarration(script), ...checkScenes(script, input));
  return { manifest: script, violations };
}
