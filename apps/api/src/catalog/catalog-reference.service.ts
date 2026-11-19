import { Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { AssetStoreError } from '@studio/core/asset-store';
import { CatalogError, CreateAssetCommand, SaveAssetVersionCommand, type NewAssetContentInput } from '@studio/core/catalog';
import {
  mimeTypeForFileName,
  type RegisterAssetByReferenceRequest,
  type SaveAssetVersionByReferenceRequest,
} from '@studio/shared/api';
import { type AssetVersion } from '@studio/shared/catalog';
import { ApiError, ReferenceMimeTypeUnknownError, ReferenceRegistrationFailedError } from '../platform/api.errors';
import { RequestContext } from '../platform/request-context';
import { ReferencePathValidator } from './reference-path.validator';

type ReferenceTarget = Pick<RegisterAssetByReferenceRequest, 'absolutePath' | 'mimeType'>;

function errnoCode(error: unknown): string | null {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code.slice(0, 32) : null;
}

/**
 * By-reference registration from the web (SPEC 0002 rev 4, section 13.4): validates the path with
 * `ReferencePathValidator`, then dispatches core's existing `CreateAssetCommand` or
 * `SaveAssetVersionCommand` with `reference-file` or `reference-folder` content. The api itself
 * never opens, reads, lists or hashes the target; core's `ReferenceInspector` hashes it in place
 * and copies nothing (criterion 22), so nothing enters `assets/`.
 */
@Injectable()
export class CatalogReferenceService {
  private readonly logger = new Logger(CatalogReferenceService.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly paths: ReferencePathValidator,
    private readonly context: RequestContext,
  ) {}

  async register(body: RegisterAssetByReferenceRequest, signal: AbortSignal): Promise<AssetVersion> {
    const content = await this.contentOf(body);
    return this.dispatch(() =>
      this.commandBus.execute(new CreateAssetCommand({ assetId: body.assetId, kind: body.kind, metadata: body.metadata, content, signal })),
    );
  }

  async saveVersion(assetId: string, body: SaveAssetVersionByReferenceRequest, signal: AbortSignal): Promise<AssetVersion> {
    const content = await this.contentOf(body);
    return this.dispatch(() => this.commandBus.execute(new SaveAssetVersionCommand({ assetId, metadata: body.metadata, content, signal })));
  }

  /** The layout comes from the target, never from the client (A23); a folder ignores `mimeType`. */
  private async contentOf(target: ReferenceTarget): Promise<NewAssetContentInput> {
    const layout = await this.paths.validate(target.absolutePath);
    if (layout === 'folder') return { source: 'reference-folder', absolutePath: target.absolutePath };
    const mimeType = target.mimeType ?? mimeTypeForFileName(target.absolutePath);
    if (mimeType === null) throw new ReferenceMimeTypeUnknownError();
    return { source: 'reference-file', absolutePath: target.absolutePath, mimeType };
  }

  /**
   * Typed core and api errors carry path-free messages (their base classes promise it) and pass
   * through to the error mapping. Anything else may name the path in its message, so it is replaced
   * by a path-free error and only its name and errno code are logged.
   */
  private async dispatch(save: () => Promise<AssetVersion>): Promise<AssetVersion> {
    try {
      return await save();
    } catch (error) {
      if (error instanceof CatalogError || error instanceof AssetStoreError || error instanceof ApiError) throw error;
      this.logger.warn({
        event: 'catalog.reference-registration-failed',
        errorName: error instanceof Error ? error.name.slice(0, 80) : 'unknown',
        errno: errnoCode(error),
        correlationId: this.context.correlationId(),
      });
      throw new ReferenceRegistrationFailedError();
    }
  }
}
