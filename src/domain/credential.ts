/**
 * Parsing of the Claude Code credential file.
 *
 * The file is owned, written, and rotated by the Claude Code CLI. Claudeland
 * only reads it, so every field is treated as untrusted and optional.
 */

import type { SessionTiming } from './session.js';

export type CredentialProblem = 'missing' | 'invalid';

export class InvalidCredentialError extends Error {
  constructor(
    public readonly problem: CredentialProblem,
    message: string,
  ) {
    super(message);
    this.name = 'InvalidCredentialError';
  }
}

export interface ClaudeCredential extends SessionTiming {
  accessToken: string;
  /**
   * Held in memory only, and only to hand it back to the Claude Code CLI.
   * It is never persisted, logged, or sent anywhere by Claudeland.
   */
  refreshToken: string | null;
  scopes: string[];
  subscriptionType: string | null;
  rateLimitTier: string | null;
}

export function parseCredential(payload: unknown): ClaudeCredential {
  if (!isRecord(payload)) {
    throw new InvalidCredentialError(
      'invalid',
      'The Claude Code credentials file is invalid.',
    );
  }

  const oauth = payload.claudeAiOauth;
  if (!isRecord(oauth)) {
    throw new InvalidCredentialError(
      'missing',
      'The Claude Code session does not contain an OAuth credential.',
    );
  }

  const accessToken = readString(oauth.accessToken);
  if (!accessToken) {
    throw new InvalidCredentialError(
      'missing',
      'The Claude Code session does not contain an OAuth credential.',
    );
  }

  const refreshToken = readString(oauth.refreshToken);

  return {
    accessToken,
    refreshToken,
    hasRefreshToken: refreshToken !== null,
    accessTokenExpiresAt: readTimestamp(oauth.expiresAt),
    refreshTokenExpiresAt: readTimestamp(oauth.refreshTokenExpiresAt),
    scopes: readScopes(oauth.scopes),
    subscriptionType: readString(oauth.subscriptionType),
    rateLimitTier: readString(oauth.rateLimitTier),
  };
}

/**
 * A view of a credential that is safe to log or include in an error.
 */
export function redactCredential(credential: ClaudeCredential): Record<string, unknown> {
  return {
    accessToken: '<redacted>',
    refreshToken: credential.refreshToken ? '<redacted>' : null,
    accessTokenExpiresAt: credential.accessTokenExpiresAt,
    refreshTokenExpiresAt: credential.refreshTokenExpiresAt,
    scopeCount: credential.scopes.length,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function readScopes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}
