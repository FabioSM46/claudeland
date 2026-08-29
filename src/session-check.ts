/**
 * Runtime verification of the session-renewal services under GJS.
 *
 * The unit tests cover the pure decision logic under Node. This harness covers
 * what only a GJS runtime can: reading the credential file through Gio, and
 * driving the Claude Code CLI through Gio.SubprocessLauncher. It runs against a
 * stub CLI, so it never touches a real account.
 *
 * Run it on every GNOME Shell release the extension declares support for.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { evaluateSession } from './domain/session.js';
import { ClaudeAuth } from './services/claude-auth.js';
import { ClaudeCredentials } from './services/claude-credentials.js';
import { UsageController } from './services/usage-controller.js';

const HOUR_MS = 60 * 60 * 1000;
const ACCESS_TOKEN = 'access-token-placeholder';
const REFRESH_TOKEN = 'refresh-token-placeholder';

const root = GLib.dir_make_tmp('claudeland-session-check-XXXXXX');
const credentialsPath = `${root}/credentials.json`;
const argvLogPath = `${root}/argv.log`;
const binDirectory = `${root}/bin`;

function write(path: string, contents: string): void {
  if (!GLib.file_set_contents(path, contents)) {
    throw new Error(`Could not write ${path}`);
  }
}

function read(path: string): string {
  const [ok, contents] = GLib.file_get_contents(path);
  if (!ok) {
    throw new Error(`Could not read ${path}`);
  }
  return new TextDecoder().decode(contents);
}

function writeCredentials(accessTokenExpiresAt: number): void {
  write(credentialsPath, JSON.stringify({
    claudeAiOauth: {
      accessToken: ACCESS_TOKEN,
      refreshToken: REFRESH_TOKEN,
      expiresAt: accessTokenExpiresAt,
      refreshTokenExpiresAt: Date.now() + 30 * 24 * HOUR_MS,
      scopes: ['user:profile', 'user:inference'],
      subscriptionType: 'max',
      rateLimitTier: 'default_claude_max_5x',
    },
  }));
}

/**
 * Stands in for the Claude Code CLI. It records how it was invoked, refuses to
 * renew without the documented environment, and rewrites the credential file
 * the way the real CLI does.
 */
function installStubCli(outcome: 'success' | 'failure'): void {
  GLib.mkdir_with_parents(binDirectory, 0o755);
  const stub = [
    '#!/bin/sh',
    `echo "argv: $*" >> "${argvLogPath}"`,
    `echo "refresh_token_env: \${CLAUDE_CODE_OAUTH_REFRESH_TOKEN:-unset}" >> "${argvLogPath}"`,
    `echo "scopes_env: \${CLAUDE_CODE_OAUTH_SCOPES:-unset}" >> "${argvLogPath}"`,
    '[ "$1" = auth ] && [ "$2" = login ] || exit 64',
    '[ -n "$CLAUDE_CODE_OAUTH_REFRESH_TOKEN" ] || exit 65',
    '[ -n "$CLAUDE_CODE_OAUTH_SCOPES" ] || exit 66',
    outcome === 'failure' ? 'exit 1' : '',
    'now=$(date +%s)',
    'expires=$(( (now + 28800) * 1000 ))',
    'refresh_expires=$(( (now + 2592000) * 1000 ))',
    `cat > "${credentialsPath}" <<JSON`,
    '{"claudeAiOauth":{"accessToken":"rotated-access-token",',
    '"refreshToken":"rotated-refresh-token",',
    '"expiresAt":$expires,"refreshTokenExpiresAt":$refresh_expires,',
    '"scopes":["user:profile","user:inference"],"subscriptionType":"max"}}',
    'JSON',
    'exit 0',
  ].filter((line) => line !== '').join('\n');

  const path = `${binDirectory}/claude`;
  write(path, `${stub}\n`);
  Gio.File.new_for_path(path).set_attribute_uint32(
    Gio.FILE_ATTRIBUTE_UNIX_MODE,
    0o755,
    Gio.FileQueryInfoFlags.NONE,
    null,
  );
  GLib.setenv('PATH', `${binDirectory}:${GLib.getenv('PATH') ?? ''}`, true);
}

function check(condition: boolean, description: string): void {
  if (!condition) {
    throw new Error(`Session check failed: ${description}`);
  }
  print(`  ok  ${description}`);
}

async function main(): Promise<void> {
  const credentials = new ClaudeCredentials(credentialsPath);

  // An access token that expired overnight, with a refresh token still valid.
  writeCredentials(Date.now() - HOUR_MS);
  const expired = await credentials.read();
  check(
    evaluateSession(expired) === 'renewable',
    'an expired access token keeps the session renewable',
  );
  check(expired.refreshToken === REFRESH_TOKEN, 'the refresh token is read from the file');

  installStubCli('success');
  const auth = new ClaudeAuth();

  check(await auth.renew(expired), 'the CLI reports a successful renewal');

  const renewed = await credentials.read();
  check(
    evaluateSession(renewed) === 'valid',
    'the renewed credential is usable again',
  );
  check(renewed.accessToken !== ACCESS_TOKEN, 'the access token was replaced by the CLI');

  const invocation = read(argvLogPath);
  const argvLine = invocation.split('\n').find((line) => line.startsWith('argv:')) ?? '';
  check(
    argvLine === 'argv: auth login --claudeai',
    'the CLI is invoked with a fixed argument vector',
  );
  check(
    !argvLine.includes(REFRESH_TOKEN),
    'the refresh token never appears in the argument vector',
  );
  check(
    invocation.includes(`refresh_token_env: ${REFRESH_TOKEN}`),
    'the refresh token is passed through the child environment',
  );
  check(
    invocation.includes('scopes_env: user:profile user:inference'),
    'the granted scopes are restated to the CLI',
  );

  // A refused renewal must be reported, not thrown, so the caller can back off.
  writeCredentials(Date.now() - HOUR_MS);
  installStubCli('failure');
  check(
    !(await auth.renew(await credentials.read())),
    'a refused renewal resolves as a failure',
  );

  // Without a refresh token there is nothing to delegate.
  write(credentialsPath, JSON.stringify({
    claudeAiOauth: { accessToken: ACCESS_TOKEN, expiresAt: Date.now() - HOUR_MS },
  }));
  const withoutRefresh = await credentials.read();
  check(
    evaluateSession(withoutRefresh) === 'expired',
    'a session without a refresh token requires signing in',
  );
  check(!(await auth.renew(withoutRefresh)), 'renewal is not attempted without a refresh token');

  auth.destroy();

  // Two Claude processes can race to rotate the same refresh token. The loser
  // reports failure, but the winner has already written a usable credential.
  // The controller must trust that shared file instead of prompting for login.
  let credentialRead = 0;
  let fetchedWithRotatedCredential = false;
  const controller = new UsageController(
    {
      get_uint: (key: string) => key === 'refresh-interval' ? 5 : 20,
    } as unknown as Gio.Settings,
    {
      credentials: {
        async read() {
          credentialRead += 1;
          return {
            accessToken: credentialRead === 1 ? ACCESS_TOKEN : 'rotated-access-token',
            refreshToken: REFRESH_TOKEN,
            hasRefreshToken: true,
            accessTokenExpiresAt: credentialRead === 1
              ? Date.now() - HOUR_MS
              : Date.now() + 8 * HOUR_MS,
            refreshTokenExpiresAt: Date.now() + 30 * 24 * HOUR_MS,
            scopes: ['user:profile', 'user:inference'],
            subscriptionType: 'max',
            rateLimitTier: 'default_claude_max_5x',
          };
        },
      },
      auth: {
        status: async () => ({
          installed: true,
          loggedIn: true,
          authMethod: 'claude.ai',
          subscriptionType: 'max',
        }),
        renew: async () => false,
        launchLogin() {},
        destroy() {},
      },
      client: {
        async fetch(credential) {
          fetchedWithRotatedCredential = credential.accessToken === 'rotated-access-token';
          return {
            snapshot: { fetchedAt: new Date().toISOString(), limits: [] },
            planLabel: 'Claude Max 5x',
          };
        },
        destroy() {},
      },
    },
  );

  await controller.refresh();
  check(
    fetchedWithRotatedCredential,
    'a concurrent CLI rotation recovers a failed renewal without signing in',
  );
  controller.destroy();
}

const loop = new GLib.MainLoop(null, false);
let failure: unknown = null;

main()
  .catch((error: unknown) => {
    failure = error;
  })
  .finally(() => loop.quit());
loop.run();

GLib.spawn_command_line_sync(`rm -rf ${root}`);

if (failure) {
  // An uncaught exception leaves GJS with a non-zero exit status.
  throw failure instanceof Error ? failure : new Error(String(failure));
}
print('Claudeland GJS session check passed');
