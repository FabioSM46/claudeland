import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {
  InvalidUsagePayloadError,
  normalizeUsage,
  type NormalizeOptions,
  type UsageSnapshot,
} from '../domain/usage.js';
import { ClaudeCredentials } from './claude-credentials.js';
import { ClaudelandError } from './errors.js';

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const OAUTH_BETA = 'oauth-2025-04-20';

export class ClaudeUsageClient {
  private readonly session = new Soup.Session({
    timeout: 20,
    user_agent: 'claudeland/0.1.0',
  });

  constructor(private readonly credentials = new ClaudeCredentials()) {}

  async fetch(options: NormalizeOptions = {}): Promise<UsageSnapshot> {
    const credential = await this.credentials.read();
    const message = Soup.Message.new('GET', USAGE_URL);
    message.request_headers.append('Authorization', `Bearer ${credential.accessToken}`);
    message.request_headers.append('anthropic-beta', OAUTH_BETA);

    let bytes: GLib.Bytes;
    try {
      bytes = await sendAndRead(this.session, message);
    } catch {
      throw new ClaudelandError(
        'network-error',
        'Impossibile raggiungere Anthropic. Controlla la connessione.',
      );
    }

    const status = message.status_code;
    if (status === Soup.Status.UNAUTHORIZED || status === Soup.Status.FORBIDDEN) {
      throw new ClaudelandError(
        'unauthorized',
        'La sessione Claude non è più valida. Accedi nuovamente.',
      );
    }
    if (status === 429) {
      throw new ClaudelandError(
        'rate-limited',
        'Troppe richieste. Claudeland riproverà più tardi.',
        parseRetryAfter(message),
      );
    }
    if (status >= 500) {
      throw new ClaudelandError(
        'server-error',
        `Anthropic non è disponibile (HTTP ${status}).`,
      );
    }
    if (status < 200 || status >= 300) {
      throw new ClaudelandError(
        'invalid-response',
        `Risposta Anthropic inattesa (HTTP ${status}).`,
      );
    }

    try {
      const data = bytes.get_data();
      if (data === null) {
        throw new InvalidUsagePayloadError('Claude usage response is empty');
      }
      const payload = JSON.parse(new TextDecoder().decode(data)) as unknown;
      return normalizeUsage(payload, options);
    } catch (error) {
      if (error instanceof InvalidUsagePayloadError) {
        throw new ClaudelandError('invalid-response', error.message);
      }
      throw new ClaudelandError(
        'invalid-response',
        'Anthropic ha restituito una risposta non valida.',
      );
    }
  }

  destroy(): void {
    this.session.abort();
  }
}

function sendAndRead(session: Soup.Session, message: Soup.Message): Promise<GLib.Bytes> {
  return new Promise((resolve, reject) => {
    session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (source, result) => {
      try {
        resolve(source!.send_and_read_finish(result));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function parseRetryAfter(message: Soup.Message): number | null {
  const header = message.response_headers.get_one('retry-after');
  if (!header) {
    return null;
  }
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}
