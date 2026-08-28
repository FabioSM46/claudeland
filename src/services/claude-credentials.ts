import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { ClaudelandError } from './errors.js';

interface CredentialFile {
  claudeAiOauth?: {
    accessToken?: unknown;
    expiresAt?: unknown;
    subscriptionType?: unknown;
    rateLimitTier?: unknown;
  };
}

export interface ClaudeCredential {
  accessToken: string;
  expiresAt: number | null;
  subscriptionType: string | null;
  rateLimitTier: string | null;
}

export class ClaudeCredentials {
  private readonly path: string;

  constructor(path?: string) {
    this.path = path ?? GLib.build_filenamev([
      GLib.get_home_dir(),
      '.claude',
      '.credentials.json',
    ]);
  }

  async read(): Promise<ClaudeCredential> {
    const file = Gio.File.new_for_path(this.path);
    let bytes: Uint8Array;

    try {
      bytes = await loadContents(file);
    } catch {
      throw new ClaudelandError(
        'credentials-missing',
        'Claude Code credentials were not found. Sign in to continue.',
      );
    }

    let parsed: CredentialFile;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes)) as CredentialFile;
    } catch {
      throw new ClaudelandError(
        'credentials-invalid',
        'The Claude Code credentials file is invalid.',
      );
    }

    const oauth = parsed.claudeAiOauth;
    if (!oauth || typeof oauth.accessToken !== 'string' || !oauth.accessToken) {
      throw new ClaudelandError(
        'credentials-missing',
        'The Claude Code session does not contain an OAuth credential.',
      );
    }

    const expiresAt = typeof oauth.expiresAt === 'number' ? oauth.expiresAt : null;
    if (expiresAt !== null && expiresAt <= Date.now()) {
      throw new ClaudelandError(
        'credentials-expired',
        'The Claude session has expired. Sign in again.',
      );
    }

    return {
      accessToken: oauth.accessToken,
      expiresAt,
      subscriptionType:
        typeof oauth.subscriptionType === 'string' ? oauth.subscriptionType : null,
      rateLimitTier: typeof oauth.rateLimitTier === 'string' ? oauth.rateLimitTier : null,
    };
  }
}

function loadContents(file: Gio.File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    file.load_contents_async(null, (source, result) => {
      try {
        const [, contents] = source!.load_contents_finish(result);
        resolve(contents);
      } catch (error) {
        reject(error);
      }
    });
  });
}
