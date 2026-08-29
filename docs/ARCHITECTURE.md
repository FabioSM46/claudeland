# Architecture

## Goals

- Show authoritative remaining capacity with minimal desktop interruption.
- Preserve GNOME Shell responsiveness when the network or account is broken.
- Make changes to Anthropic's undocumented response shape cheap to absorb.
- Avoid owning an OAuth client or browser session.

## Components

### Domain

`src/domain/usage.ts` accepts unknown JSON and produces a stable
`UsageSnapshot`. It clamps values, calculates remaining capacity, assigns
severity, deduplicates legacy and normalized response shapes, and discovers
model scopes dynamically.

`src/domain/credential.ts` parses the Claude Code credential file, and
`src/domain/session.ts` decides whether the session is usable, renewable, or
truly expired. Keeping that decision pure is what makes the difference between
"the access token expired" and "the user must sign in again" testable.

These modules have no GJS imports and run in both GNOME Shell and Node tests.

### Services

`ClaudeCredentials` reads the credential created by Claude Code, re-reading it
on every request so a token the CLI rotated is picked up immediately. It never
logs the parsed object.

`ClaudeAuth` checks whether Claude Code is available and authenticated, renews
an expired session non-interactively through the CLI, and launches the official
CLI login in the user's terminal. See ADR 003 for why renewal is delegated.

`ClaudeUsageClient` is the only module that knows the endpoint URL and beta
header. It performs one request with the credential it is given, converts
transport failures into typed errors, and hands untrusted JSON to the domain
normalizer.

`UsageController` owns the polling loop and the session state machine: read the
credential, renew it when the access token is expired or expiring, request
usage, and retry once after a renewal triggered by an HTTP 401. The happy path
spawns no subprocess.

### UI

`UsageIndicator` owns the panel button, menu, polling lifecycle, error state,
and user actions. `DesktopCard` is a read-only mirror of the latest snapshot.
It is placed in `global.window_group` directly above the `Meta.BackgroundGroup`
found among its children, which puts it above the wallpaper and below
application windows without touching private shell fields. Both anchors are
public, and the card refuses to build if the background group is missing.

The extension composition root constructs both and destroys them in reverse
order. No actor, signal, or GLib timer may survive `disable()`.

## Error policy

| Condition | Behavior |
|---|---|
| Claude CLI missing | Show installation guidance; no login action |
| Not authenticated | Show an explicit login action |
| Access token expired, refresh token valid | Renew through the CLI, retry once, no login prompt |
| Renewal failed | Preserve last data, offer login, back off for 15 minutes |
| Refresh token missing or expired / HTTP 401 after renewal | Preserve last data, request login |
| HTTP 429 | Preserve last data, apply polling backoff |
| Offline / 5xx | Preserve last data and mark it stale |
| Invalid response | Reject snapshot; never partially trust it |

## Compatibility

GNOME Shell code is compiled against GNOME 50 type definitions and supports
Shell 46 and 50. Compatibility-sensitive code uses APIs available in both
declared releases, and every declared release must be smoke-tested before
publication.
