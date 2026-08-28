import { normalizeUsage } from './domain/usage.js';

const snapshot = normalizeUsage({
  five_hour: { utilization: 25, resets_at: '2030-01-01T15:00:00Z' },
  seven_day: { utilization: 50, resets_at: '2030-01-07T15:00:00Z' },
});

if (snapshot.limits.length !== 2 || snapshot.limits[0].remainingPercent !== 75) {
  throw new Error('GJS smoke test failed');
}

print('Claudeland GJS smoke test passed');
