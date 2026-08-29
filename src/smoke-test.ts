import { parseCredential } from './domain/credential.js';
import { evaluateSession } from './domain/session.js';
import { normalizeUsage } from './domain/usage.js';

const snapshot = normalizeUsage({
  five_hour: { utilization: 25, resets_at: '2030-01-01T15:00:00Z' },
  seven_day: { utilization: 50, resets_at: '2030-01-07T15:00:00Z' },
});

if (snapshot.limits.length !== 2 || snapshot.limits[0].remainingPercent !== 75) {
  throw new Error('GJS smoke test failed');
}

const now = Date.UTC(2030, 0, 1, 12, 0, 0);
const credential = parseCredential({
  claudeAiOauth: {
    accessToken: 'placeholder',
    refreshToken: 'placeholder',
    expiresAt: now - 1000,
    refreshTokenExpiresAt: now + 86_400_000,
  },
});

if (evaluateSession(credential, now) !== 'renewable') {
  throw new Error('GJS smoke test failed: expired access token must stay renewable');
}

print('Claudeland GJS smoke test passed');
