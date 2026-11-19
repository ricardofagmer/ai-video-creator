import { ClaimManifestSchema, runFiles, type Claim, type ClaimManifest, type ResearchManifest } from '@studio/shared/ace';
import { normalizeUrl } from './text';
import { issueToViolation, type Violation } from './violations';

export interface ClaimsCheck {
  manifest: ClaimManifest | null;
  violations: Violation[];
}

export function researchSourceUrls(research: ResearchManifest): ReadonlySet<string> {
  return new Set(research.sources.map((source) => normalizeUrl(source.url)));
}

/** Supported means: marked supported AND at least one evidence quote from a researched source. */
export function isClaimSupported(claim: Claim, sourceUrls: ReadonlySet<string>): boolean {
  return claim.status === 'supported' && claim.evidence.some((evidence) => sourceUrls.has(normalizeUrl(evidence.sourceUrl)));
}

/** claims.json: schema, unique ids, every material claim supported by research.json sources. */
export function checkClaims(raw: unknown, research: ResearchManifest): ClaimsCheck {
  const parsed = ClaimManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { manifest: null, violations: parsed.error.issues.map((issue) => issueToViolation(runFiles.verify, issue)) };
  }
  const manifest = parsed.data;
  const sourceUrls = researchSourceUrls(research);
  const violations: Violation[] = [];
  const seenIds = new Set<string>();
  for (const claim of manifest.claims) {
    if (seenIds.has(claim.id)) violations.push({ code: 'INVALID_INPUT', message: `claims.json claim id "${claim.id}" is used twice` });
    seenIds.add(claim.id);
    for (const evidence of claim.evidence) {
      if (!sourceUrls.has(normalizeUrl(evidence.sourceUrl))) {
        violations.push({ code: 'INVALID_INPUT', message: `claim "${claim.id}" cites ${evidence.sourceUrl}, which is not in research.json sources` });
      }
    }
    if (claim.material && !isClaimSupported(claim, sourceUrls)) {
      const why = claim.status !== 'supported' ? `status is ${claim.status}` : 'no evidence from a research.json source';
      violations.push({ code: 'UNSUPPORTED_CLAIM', message: `material claim "${claim.id}" is not supported: ${why}` });
    }
  }
  return { manifest, violations };
}
