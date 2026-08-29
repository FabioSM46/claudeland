import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import type { ClaudeCredential } from '../domain/credential.js';
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

/**
 * Scopes used only when the credential file does not declare its own. Claude
 * Code rejects a refresh token whose scopes are not restated.
 */
const FALLBACK_SCOPES = [
  'user:profile',
  'user:inference',
  'user:sessions:claude_code',
  'user:mcp_servers',
];

/** A renewal that has not finished by then is treated as failed. */
const RENEW_TIMEOUT_SECONDS = 45;

export class ClaudeAuth {
  private process: Gio.Subprocess | null = null;
  private renewal: Promise<boolean> | null = null;
  private renewalProcess: Gio.Subprocess | null = null;

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
      this.process = process;
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
    } finally {
      this.process = null;
    }
  }

  /**
   * Asks the Claude Code CLI to exchange its refresh token for a fresh access
   * token, using the CLI's documented non-interactive login environment.
   *
   * Claudeland deliberately does not speak the OAuth token protocol itself:
   * the CLI owns the client identity, the rotation, and the credential file
   * format. The refresh token is passed through the child environment, never
   * through argv, and is not retained afterwards.
   *
   * Resolves true when the CLI reports success. It never opens a browser: the
   * refresh-token environment selects a non-interactive code path.
   */
  async renew(credential: ClaudeCredential): Promise<boolean> {
    if (!credential.refreshToken) {
      return false;
    }
    if (!GLib.find_program_in_path('claude')) {
      throw new ClaudelandError(
        'claude-cli-missing',
        'Claude Code is not installed or is not available in PATH.',
      );
    }
    if (this.renewal) {
      return this.renewal;
    }

    const scopes = credential.scopes.length > 0 ? credential.scopes : FALLBACK_SCOPES;
    this.renewal = this.spawnRenewal(credential.refreshToken, scopes.join(' '))
      .finally(() => {
        this.renewal = null;
        this.renewalProcess = null;
      });
    return this.renewal;
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

  destroy(): void {
    this.process?.force_exit();
    this.process = null;
    this.renewalProcess?.force_exit();
    this.renewalProcess = null;
    this.renewal = null;
  }

  private async spawnRenewal(refreshToken: string, scopes: string): Promise<boolean> {
    let launcher: Gio.SubprocessLauncher;
    let process: Gio.Subprocess;

    try {
      launcher = new Gio.SubprocessLauncher({
        flags: Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
      });
      // Never through argv: process arguments are world-readable.
      launcher.setenv('CLAUDE_CODE_OAUTH_REFRESH_TOKEN', refreshToken, true);
      launcher.setenv('CLAUDE_CODE_OAUTH_SCOPES', scopes, true);
      // The CLI must never block on a prompt inherited from GNOME Shell.
      launcher.set_stdin_file_path('/dev/null');
      process = launcher.spawnv(['claude', 'auth', 'login', '--claudeai']);
    } catch {
      return false;
    }

    this.renewalProcess = process;
    let timeoutId: number | null = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      RENEW_TIMEOUT_SECONDS,
      () => {
        timeoutId = null;
        process.force_exit();
        return GLib.SOURCE_REMOVE;
      },
    );

    try {
      return await waitCheck(process);
    } finally {
      if (timeoutId !== null) {
        GLib.Source.remove(timeoutId);
      }
    }
  }
}

function waitCheck(process: Gio.Subprocess): Promise<boolean> {
  return new Promise((resolve) => {
    process.wait_check_async(null, (source, result) => {
      try {
        // Throws on a non-zero exit, which the CLI uses for a failed renewal.
        resolve(source!.wait_check_finish(result));
      } catch {
        resolve(false);
      }
    });
  });
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
