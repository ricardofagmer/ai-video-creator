import { AssetStoreError, AssetStoreIoError } from './asset-store.errors';

/** An errno code or a Node `ERR_*` code; anything else is reported as `EUNKNOWN`. */
const SAFE_ERROR_CODE = /^(?:E[A-Z0-9]{1,24}|ERR_[A-Z0-9_]{1,64})$/;

export function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Replaces a raw Node file-system error, whose message carries the absolute path, with a typed
 * `AssetStoreIoError` holding the code only (asset-store.errors.ts). Typed asset-store errors,
 * aborts and non-errno errors pass through unchanged.
 */
export function toAssetStoreError(error: unknown): unknown {
  if (error instanceof AssetStoreError || !isErrnoException(error) || error.name === 'AbortError') return error;
  const code = typeof error.code === 'string' && SAFE_ERROR_CODE.test(error.code) ? error.code : 'EUNKNOWN';
  return new AssetStoreIoError(code);
}
