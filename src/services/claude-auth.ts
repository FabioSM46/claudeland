import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { ClaudelandError } from './errors.js';

export interface ClaudeAuthStatus {
  installed: boolean;
  loggedIn: boolean;
  authMethod: string | null;
  subscriptionType: string | null;
}

interface RawAuthStatus {
  loggedIn?: unknown;
  authMethod?: unknown;
  subscriptionType?: unknown;
}

export class ClaudeAuth {
  async status(): Promise<ClaudeAuthStatus> {
    if (!GLib.find_program_in_path('claude')) {
      return {
        installed: false,
        loggedIn: false,
        authMethod: null,
        subscriptionType: null,
      };
    }

    try {
      const process = Gio.Subprocess.new(
        ['claude', 'auth', 'status', '--json'],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE,
      );
      const [, stdout] = await communicateUtf8(process);
      const parsed = JSON.parse(stdout ?? '{}') as RawAuthStatus;
      return {
        installed: true,
        loggedIn: parsed.loggedIn === true,
        authMethod: typeof parsed.authMethod === 'string' ? parsed.authMethod : null,
        subscriptionType:
          typeof parsed.subscriptionType === 'string' ? parsed.subscriptionType : null,
      };
    } catch {
      return {
        installed: true,
        loggedIn: false,
        authMethod: null,
        subscriptionType: null,
      };
    }
  }

  launchLogin(): void {
    if (!GLib.find_program_in_path('claude')) {
      throw new ClaudelandError(
        'claude-cli-missing',
        'Claude Code is not installed or is not available in PATH.',
      );
    }

    const command = ['claude', 'auth', 'login', '--claudeai'];
    const terminalCandidates: string[][] = [
      ['kgx', '--', ...command],
      ['gnome-terminal', '--', ...command],
      ['x-terminal-emulator', '-e', ...command],
    ];

    for (const argv of terminalCandidates) {
      if (GLib.find_program_in_path(argv[0])) {
        Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
        return;
      }
    }

    throw new ClaudelandError(
      'claude-cli-missing',
      'No compatible terminal was found to start Claude sign-in.',
    );
  }
}

function communicateUtf8(process: Gio.Subprocess): Promise<[boolean, string | null, string | null]> {
  return new Promise((resolve, reject) => {
    process.communicate_utf8_async(null, null, (source, result) => {
      try {
        resolve(source!.communicate_utf8_finish(result));
      } catch (error) {
        reject(error);
      }
    });
  });
}
