import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  InvalidUsagePayloadError,
  compactLimitLabel,
  formatPercent,
  formatTimeRemaining,
  normalizeUsage,
  severityFor,
} from '../src/domain/usage.js';

function fixture(name: string): unknown {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as unknown;
}

describe('normalizeUsage', () => {
  it('normalizes legacy limits as remaining capacity', () => {
    const snapshot = normalizeUsage(fixture('legacy-response.json'), {
      now: new Date('2030-01-01T10:00:00Z'),
    });

    expect(snapshot.limits.map((limit) => limit.id)).toEqual([
      'five_hour',
      'seven_day',
      'seven_day_sonnet',
    ]);
    expect(snapshot.limits[0]).toMatchObject({
      consumedPercent: 42.4,
      remainingPercent: 57.6,
      label: 'Sessione corrente',
    });
  });

  it('deduplicates normalized limits and discovers future model scopes', () => {
    const snapshot = normalizeUsage(fixture('normalized-response.json'));

    expect(snapshot.limits.map((limit) => limit.id)).toEqual([
      'five_hour',
      'seven_day',
      'seven_day_fable',
      'seven_day_future_model',
    ]);
    expect(snapshot.limits[2]).toMatchObject({
      label: 'Settimanale · Fable',
      scopeModel: 'Fable',
      remainingPercent: 94,
    });
  });

  it('clamps malformed percentages and honors remaining thresholds', () => {
    const snapshot = normalizeUsage(
      {
        five_hour: { utilization: 150 },
        seven_day: { utilization: -10 },
      },
      { warningRemaining: 30, criticalRemaining: 15 },
    );

    expect(snapshot.limits[0]).toMatchObject({ remainingPercent: 0, severity: 'critical' });
    expect(snapshot.limits[1]).toMatchObject({ remainingPercent: 100, severity: 'ok' });
  });

  it('accepts an object-shaped limits wrapper', () => {
    const snapshot = normalizeUsage({
      limits: { five_hour: { utilization: 50 } },
    });
    expect(snapshot.limits[0].remainingPercent).toBe(50);
  });

  it('rejects payloads with no usable limits', () => {
    expect(() => normalizeUsage({ limits: [] })).toThrow(InvalidUsagePayloadError);
    expect(() => normalizeUsage(null)).toThrow('not an object');
  });
});

describe('formatting', () => {
  it('formats percentages without unnecessary decimals', () => {
    expect(formatPercent(50)).toBe('50%');
    expect(formatPercent(50.25)).toBe('50.3%');
  });

  it('formats reset countdowns', () => {
    const now = new Date('2030-01-01T10:00:00Z');
    expect(formatTimeRemaining('2030-01-01T15:00:00Z', now)).toBe('reset tra 5h 0m');
    expect(formatTimeRemaining('2030-01-03T12:30:00Z', now)).toBe('reset tra 2g 2h');
    expect(formatTimeRemaining(null, now)).toBe('reset non disponibile');
  });

  it('assigns severity and compact labels', () => {
    expect(severityFor(10)).toBe('critical');
    expect(severityFor(25)).toBe('warning');
    expect(severityFor(26)).toBe('ok');
    expect(compactLimitLabel({
      id: 'seven_day_fable',
      label: 'Settimanale · Fable',
      consumedPercent: 5,
      remainingPercent: 95,
      resetsAt: null,
      scopeModel: 'Fable',
      severity: 'ok',
    })).toBe('F');
  });
});
