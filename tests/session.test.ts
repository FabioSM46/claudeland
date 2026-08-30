import { describe, expect, it } from 'vitest';

import {
  InvalidCredentialError,
  parseCredential,
  redactCredential,
} from '../src/domain/credential.js';
import {
  ACCESS_TOKEN_SKEW_MS,
  canRenew,
  evaluateSession,
  isAccessTokenUsable,
  type SessionTiming,
} from '../src/domain/session.js';

const NOW = Date.UTC(2026, 7, 29, 8, 0, 0);
const HOUR = 60 * 60 * 1000;

function timing(overrides: Partial<SessionTiming> = {}): SessionTiming {
  return {
    accessTokenExpiresAt: NOW + 8 * HOUR,
    refreshTokenExpiresAt: NOW + 30 * 24 * HOUR,
    hasRefreshToken: true,
    ...overrides,
  };
}

describe('evaluateSession', () => {
  it('keeps a live access token valid', () => {
    expect(evaluateSession(timing(), NOW)).toBe('valid');
  });

  it('renews an access token that expired overnight', () => {
    const overnight = timing({ accessTokenExpiresAt: NOW - HOUR });
    expect(evaluateSession(overnight, NOW)).toBe('renewable');
  });

  it('renews before the deadline so a request cannot expire in flight', () => {
    const closing = timing({ accessTokenExpiresAt: NOW + ACCESS_TOKEN_SKEW_MS - 1 });
    expect(evaluateSession(closing, NOW)).toBe('renewable');
    expect(isAccessTokenUsable(closing, NOW)).toBe(false);
  });

  it('requires sign-in only when the refresh token is gone', () => {
    const noRefresh = timing({ accessTokenExpiresAt: NOW - HOUR, hasRefreshToken: false });
    expect(evaluateSession(noRefresh, NOW)).toBe('expired');
  });

  it('requires sign-in when the refresh token itself expired', () => {
    const stale = timing({
      accessTokenExpiresAt: NOW - HOUR,
      refreshTokenExpiresAt: NOW - HOUR,
    });
    expect(evaluateSession(stale, NOW)).toBe('expired');
  });

  it('treats an unknown access expiry as usable and lets the server decide', () => {
    expect(evaluateSession(timing({ accessTokenExpiresAt: null }), NOW)).toBe('valid');
  });

  it('treats an unknown refresh expiry as worth attempting', () => {
    const unknown = timing({ accessTokenExpiresAt: NOW - HOUR, refreshTokenExpiresAt: null });
    expect(canRenew(unknown, NOW)).toBe(true);
  });

  it('never renews without a refresh token', () => {
    expect(canRenew(timing({ hasRefreshToken: false }), NOW)).toBe(false);
  });
});

describe('parseCredential', () => {
  const file = {
    claudeAiOauth: {
      accessToken: 'access-token-placeholder',
      refreshToken: 'refresh-token-placeholder',
      expiresAt: NOW + 8 * HOUR,
      refreshTokenExpiresAt: NOW + 30 * 24 * HOUR,
      scopes: ['user:profile', 'user:inference', 42],
      subscriptionType: 'max',
      rateLimitTier: 'default_claude_max_5x',
    },
  };

  it('reads both token lifetimes and the granted scopes', () => {
    const credential = parseCredential(file);

    expect(credential.accessTokenExpiresAt).toBe(NOW + 8 * HOUR);
    expect(credential.refreshTokenExpiresAt).toBe(NOW + 30 * 24 * HOUR);
    expect(credential.hasRefreshToken).toBe(true);
    expect(credential.scopes).toEqual(['user:profile', 'user:inference']);
    expect(credential.subscriptionType).toBe('max');
  });

  it('accepts a credential without refresh metadata', () => {
    const credential = parseCredential({
      claudeAiOauth: { accessToken: 'access-token-placeholder' },
    });

    expect(credential.hasRefreshToken).toBe(false);
    expect(credential.refreshTokenExpiresAt).toBeNull();
    expect(credential.scopes).toEqual([]);
    expect(evaluateSession(credential, NOW)).toBe('valid');
  });

  it('ignores malformed timestamps instead of trusting them', () => {
    const credential = parseCredential({
      claudeAiOauth: { accessToken: 'access-token-placeholder', expiresAt: 'soon' },
    });

    expect(credential.accessTokenExpiresAt).toBeNull();
  });

  it('rejects a file without an OAuth credential', () => {
    expect(() => parseCredential({})).toThrow(InvalidCredentialError);
    expect(() => parseCredential({ claudeAiOauth: { accessToken: '' } })).toThrow(
      InvalidCredentialError,
    );
  });

  it('reports a non-object payload as invalid rather than missing', () => {
    try {
      parseCredential('nope');
      expect.unreachable();
    } catch (error) {
      expect((error as InvalidCredentialError).problem).toBe('invalid');
    }
  });

  it('never exposes token material in its loggable view', () => {
    const view = JSON.stringify(redactCredential(parseCredential(file)));

    expect(view).not.toContain('access-token-placeholder');
    expect(view).not.toContain('refresh-token-placeholder');
    expect(view).toContain('<redacted>');
  });
});
