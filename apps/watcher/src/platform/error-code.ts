/** True when a thrown Node error carries this `code` (`ENOENT`, `ELOOP`, ...), without trusting its shape. */
export function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
