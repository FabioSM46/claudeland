# Notes for the extensions.gnome.org review

These notes answer, up front, the questions a reviewer is most likely to have
about Claudeland. They are meant to be pasted into the submission comment.

## What the extension does

Claudeland shows how much of a Claude subscription is left: the rolling
five-hour window, the weekly limits, and any model-scoped limits the account
returns. It reads the credential created by Claude Code, Anthropic's official
CLI, and performs one authenticated `GET` to
`https://api.anthropic.com/api/oauth/usage`.

It never sends prompts, never creates conversations, and has no telemetry.

## Why the extension launches a process

Claudeland does not own an OAuth client. Authentication and token renewal are
delegated to the Claude Code CLI the user already has installed, which is the
only component allowed to hold the client identity and rotate the refresh
token. That delegation is the reason for every `Gio.Subprocess` call, and there
are exactly three. Each uses a fixed argument vector — no shell, no string
interpolation, and no value that a network response or a setting can influence.

### 1. `claude auth status --json`

`Gio.Subprocess.new(['claude', 'auth', 'status', '--json'], STDOUT_PIPE | STDERR_SILENCE)`

Runs only when the credential file is missing or unparsable, to tell "Claude
Code is not installed" apart from "Claude Code is installed but signed out".
Its output is parsed as JSON and only three fields are read. Ordinary polling
never reaches this path.

### 2. `claude auth login --claudeai` (non-interactive renewal)

`Gio.SubprocessLauncher` with `STDOUT_SILENCE | STDERR_SILENCE`, stdin bound to
`/dev/null`, and two variables added to the child environment:
`CLAUDE_CODE_OAUTH_REFRESH_TOKEN` and `CLAUDE_CODE_OAUTH_SCOPES`. This is the
CLI's documented non-interactive login path; it performs the token exchange and
rewrites its own credential file, and it does not open a browser.

Runs only when the access token has expired or an authenticated request was
rejected. It is serialised (one renewal at a time), abandoned after 45 seconds,
and not retried for 15 minutes after a failure, so a broken session cannot turn
polling into repeated process spawning.

The refresh token is passed through the environment rather than the argument
vector, because `/proc/<pid>/cmdline` is world-readable while
`/proc/<pid>/environ` is not. Claudeland holds it in memory for the duration of
that call only: it is never written to GSettings, to a file, or to the journal.

### 3. `claude auth login --claudeai` (interactive sign-in)

Launched in the user's terminal (`kgx`, `gnome-terminal`, or
`x-terminal-emulator`) from an explicit menu item, so the browser sign-in is
Anthropic's own flow and the user can see it. Never launched automatically.

## Other points a reviewer usually checks

- **No synchronous work on the main loop.** File reads use
  `load_contents_async`, HTTP uses `Soup.Session.send_and_read_async`, and both
  subprocess calls use the async `communicate_utf8_async` / `wait_check_async`
  variants.
- **Cleanup.** `disable()` destroys the indicator, the desktop card, and the
  controller. The controller removes its `GLib` timeout, disconnects listeners,
  force-exits any subprocess still running, and aborts the `Soup.Session`.
  Signals are connected with `connectObject()` and released with
  `disconnectObject()`.
- **No eval and no remote code.** Nothing is downloaded and executed; the only
  network response is JSON, which is treated as untrusted and normalised in
  `domain/usage.js`.
- **Private API.** The optional desktop card is added to
  `Main.layoutManager._backgroundGroup` so it sits below application windows,
  which has no public equivalent. If that is unacceptable, the card can be
  dropped or moved to `addChrome()`; the panel indicator does not depend on it.
- **Settings.** Only presentation and polling preferences are stored. No token,
  account identifier, or email address is ever written to GSettings.

## Supported releases and how they were verified

`metadata.json` declares GNOME Shell 46 and 50. Both are verified with
`pnpm verify:shell`, which for each release starts a real headless GNOME Shell
in a disposable container, enables the extension, checks that it reaches the
`ACTIVE` state and survives a disable/enable cycle with an empty journal, and
then renders every panel and card state through a throwaway probe extension.
The containers have no network access and mock logind on a private bus, so the
verification touches nothing outside itself.
