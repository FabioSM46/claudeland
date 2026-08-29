/**
 * Pure decision logic for the lifetime of a Claude Code OAuth session.
 *
 * Claude Code issues a short-lived access token (hours) alongside a long-lived
 * refresh token (weeks). An expired access token therefore does not mean the
 * session is gone: it means the session must be renewed. Only the loss or
 * expiry of the refresh token requires an interactive sign-in.
 */

export type SessionState =
  /** The access token can be used as is. */
  | 'valid'
  /** The access token is expired or about to expire, but renewal is possible. */
  | 'renewable'
  /** Interactive sign-in is the only way forward. */
  | 'expired';

export interface SessionTiming {
  /** Access-token expiry in epoch milliseconds, or null when unknown. */
  accessTokenExpiresAt: number | null;
  /** Refresh-token expiry in epoch milliseconds, or null when unknown. */
  refreshTokenExpiresAt: number | null;
  /** Whether a refresh token is present at all. */
  hasRefreshToken: boolean;
}

/**
 * Renew slightly before the real deadline so a request cannot expire in flight.
 */
export const ACCESS_TOKEN_SKEW_MS = 5 * 60 * 1000;

export function evaluateSession(
  timing: SessionTiming,
  now: number = Date.now(),
): SessionState {
  if (isAccessTokenUsable(timing, now)) {
    return 'valid';
  }
  return canRenew(timing, now) ? 'renewable' : 'expired';
}

/**
 * True while the access token is still worth sending. An unknown expiry is
 * treated as usable: the server answer, not a guess, decides.
 */
export function isAccessTokenUsable(
  timing: SessionTiming,
  now: number = Date.now(),
): boolean {
  if (timing.accessTokenExpiresAt === null) {
    return true;
  }
  return now < timing.accessTokenExpiresAt - ACCESS_TOKEN_SKEW_MS;
}

/**
 * True when a delegated renewal has a chance of succeeding. An unknown refresh
 * expiry is treated as renewable: attempting costs one CLI call and the CLI is
 * the authority on whether the token still works.
 */
export function canRenew(
  timing: SessionTiming,
  now: number = Date.now(),
): boolean {
  if (!timing.hasRefreshToken) {
    return false;
  }
  if (timing.refreshTokenExpiresAt === null) {
    return true;
  }
  return now < timing.refreshTokenExpiresAt;
}
