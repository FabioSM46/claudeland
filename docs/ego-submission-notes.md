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
token. That delegation accounts for three subprocess purposes, implemented at
four call sites: status and renewal run in the Shell process, while interactive
sign-in is available from both the Shell menu and the separate preferences
process. Every call uses a fixed argument vector — no shell, no string
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
Anthropic's own flow and the user can see it. The same fixed command is exposed
from the preferences window, which runs in a separate GTK process. It is never
launched automatically. The user-initiated terminal is intentionally allowed
to remain open until authentication finishes, even if the extension is disabled.

## Other points a reviewer usually checks

- **No synchronous work on the main loop.** File reads use
  `load_contents_async`, HTTP uses `Soup.Session.send_and_read_async`, and the
  status and renewal paths use the async `communicate_utf8_async` /
  `wait_check_async` variants. Interactive sign-in returns immediately after
  launching the user's terminal.
- **Cleanup.** `disable()` destroys the indicator, the desktop card, and the
  controller. The controller removes its `GLib` timeout, disconnects listeners,
  force-exits any subprocess still running, and aborts the `Soup.Session`.
  Shell signals use `connectObject()`; they are released by destroying their
  owning actor or by an explicit `disconnectObject()` during cleanup.
- **No eval and no remote code.** Nothing is downloaded and executed; the only
  network response is JSON, which is treated as untrusted and normalised in
  `domain/usage.js`.
- **No private shell API.** The optional desktop card, which is off by default,
  has to sit above the wallpaper and below application windows. It reaches that
  layer through public API only: it is parented into the `Meta.BackgroundGroup`
  found among `global.window_group`'s children, rather than through
  `LayoutManager`'s private field for that same group. It has to be inside that
  group rather than beside it, because mutter reorders the window group's own
  actors around any foreign sibling and would float the card above the windows.
  If the group is not found the card refuses to build and the extension reports
  it, leaving the panel indicator working. The stacking is asserted against a
  window opened after the card on every supported release by the verification
  described below.
- **Settings.** Only presentation and polling preferences are stored. No token,
  account identifier, or email address is ever written to GSettings.

## Supported releases and how they were verified

Claudeland is submitted as two archives built from one source tree, carrying the
same uuid and version and declaring disjoint Shell ranges: the ES module package
for GNOME Shell 45 through 50 (`metadata.json`), and a legacy package for GNOME
Shell 42, 43 and 44 (`metadata-legacy.json`), which predate the ES module
extension API. See ADR 004 for the rationale and the build.

### Why extension.js is a single file in the legacy archive

The legacy archive is not obfuscated and not minified. GNOME Shell 42 to 44 load
extension.js as a plain script through the `imports` object, which cannot
evaluate the ES module sources or their relative imports, so the same TypeScript
is bundled into one readable script per entry point by
`scripts/build-legacy.mjs`. Every `gi://` and `resource://` import is rewritten
to its `imports` equivalent through the shims in `scripts/legacy/shims`, which
are short and reviewable on their own.

The ES module archive keeps the ordinary per-module layout. Both archives are
built from the same sources by `pnpm package`, and the repository linked in
metadata.json contains the build, the shims and the verification harness.

Every declared release is verified with `pnpm verify:shell`, which starts a real
headless GNOME Shell in a disposable container, installs the package that
release would actually receive, and checks that the extension:

- reaches the active state and survives a disable/enable cycle with an empty
  journal;
- opens its preferences dialog, which runs in a separate GTK process against a
  different library stack;
- renders every panel and card state — loading, renewing, failed renewal, stale
  data, and a full snapshot, in both the compact and full panel layouts —
  through a throwaway probe extension.

The containers have no network access and mock logind on a private bus, so the
verification touches nothing outside itself.
