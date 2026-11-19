import { ResearchManifestSchema, runFiles, type ResearchManifest } from '@studio/shared/ace';
import { issueToViolation, type Violation } from './violations';

export interface ResearchCheck {
  manifest: ResearchManifest | null;
  violations: Violation[];
}

/** research.json: schema, at least 2 sources and at least 1 primary source. */
export function checkResearch(raw: unknown): ResearchCheck {
  const parsed = ResearchManifestSchema.safeParse(raw);
  if (!parsed.success) {
    const violations = parsed.error.issues.map((issue) => {
      const tooFewSources = issue.code === 'too_small' && issue.path.length === 1 && issue.path[0] === 'sources';
      return issueToViolation(runFiles.research, issue, tooFewSources ? 'INSUFFICIENT_SOURCES' : 'INVALID_INPUT');
    });
    return { manifest: null, violations };
  }
  const manifest = parsed.data;
  const violations: Violation[] = [];
  if (!manifest.sources.some((source) => source.primary)) {
    violations.push({ code: 'INSUFFICIENT_SOURCES', message: 'research.json has no primary source (official docs, vendor page or reproducible test)' });
  }
  const seen = new Set<string>();
  for (const source of manifest.sources) {
    if (seen.has(source.url)) violations.push({ code: 'INVALID_INPUT', message: `research.json lists ${source.url} twice` });
    seen.add(source.url);
  }
  return { manifest, violations };
}
