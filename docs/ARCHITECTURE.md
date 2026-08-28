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

This module has no GJS imports and runs in both GNOME Shell and Node tests.

### Services

`ClaudeCredentials` reads the credential created by Claude Code. It returns the
minimum fields needed for a request and never logs the parsed object.

`ClaudeAuth` checks whether Claude Code is available/authenticated and launches
the official CLI login in the user's terminal.

`ClaudeUsageClient` is the only module that knows the endpoint URL, beta header,
or credential file shape. It converts transport failures into typed errors and
hands untrusted JSON to the domain normalizer.

### UI

`UsageIndicator` owns the panel button, menu, polling lifecycle, error state,
and user actions. `DesktopCard` is a read-only mirror of the latest snapshot.

The extension composition root constructs both and destroys them in reverse
order. No actor, signal, or GLib timer may survive `disable()`.

## Error policy

| Condition | Behavior |
|---|---|
| Claude CLI missing | Show installation guidance; no login action |
| Not authenticated | Show an explicit login action |
| Credential expired / HTTP 401 | Preserve last data, request login |
| HTTP 429 | Preserve last data, apply polling backoff |
| Offline / 5xx | Preserve last data and mark it stale |
| Invalid response | Reject snapshot; never partially trust it |

## Compatibility

GNOME Shell code is compiled against GNOME 50 type definitions and supports
Shell 46 and 50. Compatibility-sensitive code uses APIs available in both
declared releases, and every declared release must be smoke-tested before
publication.
