export type ClaudelandErrorCode =
  | 'claude-cli-missing'
  | 'not-authenticated'
  | 'credentials-missing'
  | 'credentials-invalid'
  | 'credentials-expired'
  | 'renewal-failed'
  | 'unauthorized'
  | 'rate-limited'
  | 'server-error'
  | 'network-error'
  | 'invalid-response';

export class ClaudelandError extends Error {
  constructor(
    public readonly code: ClaudelandErrorCode,
    message: string,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'ClaudelandError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ClaudelandError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown error';
}
