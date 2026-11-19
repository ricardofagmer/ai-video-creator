import { Injectable } from '@nestjs/common';
import { type ComparisonArmDetail, type ComparisonDetail, type ComparisonDetailPage } from '@studio/core/comparisons';
import { type ComparisonArmView, type ComparisonPageView, type ComparisonView } from '@studio/shared/api';
import { RunArtifactAccessService } from '../runs/run-artifact-access.service';

/**
 * Adds each arm's `artifactAccess` to core's comparison detail (SPEC 0003 section 4.3). The api
 * owns the rev 4 rule of `GET /runs/:runId` (SPEC 0002 rev 4, section 13.5), so an arm's
 * `final.mp4` is playable on the comparison page exactly when the run page would play it; a run
 * folder that cannot be read fails closed to `withheld`.
 */
@Injectable()
export class ComparisonResponseAssembler {
  constructor(private readonly artifactAccess: RunArtifactAccessService) {}

  async one(detail: ComparisonDetail): Promise<ComparisonView> {
    const [a, b] = await Promise.all([this.arm(detail.arms.a), this.arm(detail.arms.b)]);
    return { ...detail, arms: { a, b } };
  }

  async page(page: ComparisonDetailPage): Promise<ComparisonPageView> {
    const items: ComparisonView[] = [];
    // One comparison at a time: each arm reads its run folder and looks up its refs' sensitivity.
    for (const detail of page.items) items.push(await this.one(detail));
    return { items, total: page.total, nextCursor: page.nextCursor };
  }

  private async arm(detail: ComparisonArmDetail): Promise<ComparisonArmView> {
    return { ...detail, artifactAccess: await this.artifactAccess.forArtifactRoute(detail.runId) };
  }
}
