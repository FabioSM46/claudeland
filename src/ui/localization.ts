import { gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';

import type { Translator } from '../domain/usage.js';
import type { ClaudelandErrorCode } from '../services/errors.js';

const ERROR_MESSAGES: Partial<Record<ClaudelandErrorCode, string>> = {
  'claude-cli-missing': 'Install Claude Code to authenticate.',
  'not-authenticated': 'Sign in to Claude Code to view usage.',
  'credentials-missing': 'Claude Code credentials were not found. Sign in to continue.',
  'credentials-invalid': 'The Claude Code credentials file is invalid.',
  'credentials-expired': 'The Claude session has expired. Sign in again.',
  'renewal-failed':
    'The Claude session could not be renewed automatically. Retrying later.',
  unauthorized: 'The Claude session is no longer valid. Sign in again.',
  'rate-limited': 'Too many requests. Claudeland will try again later.',
  'server-error': 'Anthropic is currently unavailable.',
  'network-error': 'Could not reach Anthropic. Check your connection.',
  'invalid-response': 'Anthropic returned an invalid response.',
};

export const translate: Translator = _;

export function localizedError(
  code: ClaudelandErrorCode | null,
  fallback: string | null,
): string {
  const message = code ? ERROR_MESSAGES[code] : null;
  return _(message ?? fallback ?? 'Unknown error');
}

export function formatMessage(template: string, ...values: Array<string | number>): string {
  let index = 0;
  return template.replace(/%[sd]/g, () => String(values[index++] ?? ''));
}
