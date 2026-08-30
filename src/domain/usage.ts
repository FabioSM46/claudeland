export type UsageSeverity = 'ok' | 'warning' | 'critical';

export interface UsageLimit {
  id: string;
  label: string;
  consumedPercent: number;
  remainingPercent: number;
  resetsAt: string | null;
  scopeModel: string | null;
  severity: UsageSeverity;
}

export interface UsageSnapshot {
  fetchedAt: string;
  limits: UsageLimit[];
}

export interface NormalizeOptions {
  warningRemaining?: number;
  criticalRemaining?: number;
  now?: Date;
}

export type Translator = (message: string) => string;

export class InvalidUsagePayloadError extends Error {
  constructor(message = 'Claude returned no supported usage limits') {
    super(message);
    this.name = 'InvalidUsagePayloadError';
  }
}

type UnknownRecord = Record<string, unknown>;

const IGNORED_TOP_LEVEL_KEYS = new Set([
  'limits',
  'quotas',
  'organization',
  'subscription',
  'rate_limit_tier',
]);

const PRIORITY: Record<string, number> = {
  five_hour: 0,
  seven_day: 1,
  extra_usage: 3,
};

export function normalizeUsage(payload: unknown, options: NormalizeOptions = {}): UsageSnapshot {
  if (!isRecord(payload)) {
    throw new InvalidUsagePayloadError('Claude usage response is not an object');
  }

  const warningRemaining = clamp(options.warningRemaining ?? 25, 0, 100);
  const criticalRemaining = clamp(options.criticalRemaining ?? 10, 0, warningRemaining);
  const candidates = collectCandidates(payload);
  const limits = new Map<string, UsageLimit>();

  for (const [sourceKey, candidate] of candidates) {
    const utilization = firstNumber(
      candidate.utilization,
      candidate.percent,
      candidate.percentage,
      candidate.usage,
    );

    if (utilization === null) {
      continue;
    }

    const scopeModel = readScopeModel(candidate);
    const id = canonicalId(sourceKey, candidate, scopeModel);
    if (!id || limits.has(id)) {
      continue;
    }

    const consumedPercent = round(clamp(utilization, 0, 100), 1);
    const remainingPercent = round(100 - consumedPercent, 1);
    limits.set(id, {
      id,
      label: limitLabel(id, scopeModel),
      consumedPercent,
      remainingPercent,
      resetsAt: readReset(candidate),
      scopeModel,
      severity: severityFor(remainingPercent, warningRemaining, criticalRemaining),
    });
  }

  if (limits.size === 0) {
    throw new InvalidUsagePayloadError();
  }

  return {
    fetchedAt: (options.now ?? new Date()).toISOString(),
    limits: [...limits.values()].sort(compareLimits),
  };
}

export function severityFor(
  remainingPercent: number,
  warningRemaining = 25,
  criticalRemaining = 10,
): UsageSeverity {
  if (remainingPercent <= criticalRemaining) {
    return 'critical';
  }
  if (remainingPercent <= warningRemaining) {
    return 'warning';
  }
  return 'ok';
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

export function formatTimeRemaining(
  resetsAt: string | null,
  now = new Date(),
  translate: Translator = identity,
): string {
  if (!resetsAt) {
    return translate('reset unavailable');
  }

  const resetTime = Date.parse(resetsAt);
  if (!Number.isFinite(resetTime)) {
    return translate('reset unavailable');
  }

  const milliseconds = Math.max(0, resetTime - now.getTime());
  const totalMinutes = Math.ceil(milliseconds / 60_000);
  if (totalMinutes === 0) {
    return translate('reset imminent');
  }

  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return formatTemplate(translate('resets in %dd %dh'), days, hours);
  }
  if (hours > 0) {
    return formatTemplate(translate('resets in %dh %dm'), hours, minutes);
  }
  return formatTemplate(translate('resets in %dm'), minutes);
}

export function localizedLimitLabel(
  limit: Pick<UsageLimit, 'id' | 'label' | 'scopeModel'>,
  translate: Translator = identity,
): string {
  if (limit.id === 'five_hour') {
    return translate('Current session');
  }
  if (limit.id === 'seven_day') {
    return translate('Weekly · all models');
  }
  if (limit.scopeModel) {
    return formatTemplate(translate('Weekly · %s'), limit.scopeModel);
  }
  return translate(limit.label);
}

export function compactLimitLabel(limit: UsageLimit): string {
  if (limit.id === 'five_hour') {
    return '5h';
  }
  if (limit.id === 'seven_day') {
    return '7g';
  }
  if (limit.scopeModel) {
    return limit.scopeModel.slice(0, 1).toUpperCase();
  }
  return limit.label.slice(0, 3);
}

export function formatPlanLabel(
  subscriptionType: string | null,
  rateLimitTier: string | null,
): string {
  const subscription = subscriptionType?.trim().toLowerCase() ?? '';
  const tier = rateLimitTier?.trim().toLowerCase() ?? '';

  if (subscription === 'max' || tier.includes('claude_max')) {
    if (tier.includes('20x')) {
      return 'Max (20x)';
    }
    if (tier.includes('5x')) {
      return 'Max (5x)';
    }
    return 'Max';
  }

  const knownPlans: Record<string, string> = {
    free: 'Free',
    pro: 'Pro',
    team: 'Team',
    enterprise: 'Enterprise',
  };
  if (knownPlans[subscription]) {
    return knownPlans[subscription];
  }

  return subscriptionType?.trim() || 'Claude';
}

function collectCandidates(payload: UnknownRecord): Array<[string, UnknownRecord]> {
  const candidates: Array<[string, UnknownRecord]> = [];

  for (const [key, value] of Object.entries(payload)) {
    if (!IGNORED_TOP_LEVEL_KEYS.has(key) && isRecord(value)) {
      candidates.push([key, value]);
    }
  }

  collectNested(payload.limits, candidates);
  collectNested(payload.quotas, candidates);
  return candidates;
}

function collectNested(value: unknown, candidates: Array<[string, UnknownRecord]>): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (isRecord(entry)) {
        const key = firstString(entry.id, entry.kind, entry.type) ?? 'unknown';
        candidates.push([key, entry]);
      }
    }
    return;
  }

  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (isRecord(entry)) {
        candidates.push([key, entry]);
      }
    }
  }
}

function canonicalId(
  sourceKey: string,
  candidate: UnknownRecord,
  scopeModel: string | null,
): string | null {
  const rawKind = (firstString(candidate.kind, candidate.type, candidate.id) ?? sourceKey)
    .toLowerCase()
    .replaceAll('-', '_');

  if (scopeModel) {
    return `seven_day_${slugify(scopeModel)}`;
  }
  if (['session', 'five_hour', 'fivehour'].includes(rawKind)) {
    return 'five_hour';
  }
  if (['weekly', 'week', 'seven_day', 'sevenday'].includes(rawKind)) {
    return 'seven_day';
  }
  if (rawKind === 'spend') {
    return 'extra_usage';
  }

  const slug = slugify(rawKind);
  return slug || null;
}

function limitLabel(id: string, scopeModel: string | null): string {
  if (id === 'five_hour') {
    return 'Current session';
  }
  if (id === 'seven_day') {
    return 'Weekly · all models';
  }
  if (scopeModel) {
    return `Weekly · ${scopeModel}`;
  }
  if (id === 'extra_usage') {
    return 'Extra usage';
  }

  return id
    .split('_')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function readScopeModel(candidate: UnknownRecord): string | null {
  if (!isRecord(candidate.scope) || !isRecord(candidate.scope.model)) {
    return null;
  }

  return firstString(
    candidate.scope.model.display_name,
    candidate.scope.model.name,
    candidate.scope.model.id,
  );
}

function readReset(candidate: UnknownRecord): string | null {
  const reset = firstString(candidate.resets_at, candidate.resetsAt, candidate.reset_at);
  return reset && Number.isFinite(Date.parse(reset)) ? reset : null;
}

function compareLimits(left: UsageLimit, right: UsageLimit): number {
  const leftPriority = PRIORITY[left.id] ?? (left.scopeModel ? 2 : 4);
  const rightPriority = PRIORITY[right.id] ?? (right.scopeModel ? 2 : 4);
  return leftPriority - rightPriority || left.label.localeCompare(right.label);
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, decimals: number): number {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function formatTemplate(template: string, ...values: Array<string | number>): string {
  let index = 0;
  return template.replace(/%[sd]/g, () => String(values[index++] ?? ''));
}

function identity(message: string): string {
  return message;
}
