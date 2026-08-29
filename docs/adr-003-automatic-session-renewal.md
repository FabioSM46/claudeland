# ADR 003: Renew the session through the Claude Code CLI

- Status: accepted
- Date: 2026-08-29

## Context

Claude Code issues a short-lived access token next to a long-lived refresh
token. On the observed installation the access token lasted eight hours and the
refresh token about thirty days.

Claudeland treated any expired access token as a lost session and asked for an
interactive sign-in. An overnight gap was therefore enough to demand a browser
login while the session was, in fact, still valid for four more weeks.

Three renewal strategies were considered.

1. Post to the OAuth token endpoint directly. This duplicates a sensitive,
   undocumented flow: client identity, refresh-token rotation, and the layout
   of the credential file would all become Claudeland's problem.
2. Ask the CLI for a refresh. There is no `claude auth refresh` in 2.1.251.
   `claude auth status` performs no renewal at all — it reports `loggedIn:
   true` even when the access token has expired — and the only implicit
   renewal happens when a full agent session starts, which is far too heavy to
   run from a GNOME Shell extension on a timer.
3. Use the CLI's non-interactive login environment,
   `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` with `CLAUDE_CODE_OAUTH_SCOPES`. This is a
   documented Claude Code contract, it reaches the token endpoint without a
   browser, and it exits non-zero when renewal fails.

## Decision

Distinguish a renewable session from an expired one, and never ask for a
sign-in while a valid refresh token exists.

When the access token is expired or within five minutes of expiry, and after an
HTTP 401 on a token that still looked valid, run
`claude auth login --claudeai` with the refresh token and its scopes in the
child environment, then re-read the credential file and retry the request once.
Interactive sign-in is offered only when the refresh token is missing or itself
expired, or when renewal fails.

Renewal is rate-limited: one attempt at a time, and a fifteen-minute cooldown
after a failure so a broken session cannot spawn a subprocess on every poll.

## Consequences

- A session renews itself across an overnight gap without user action.
- Claude Code keeps ownership of the client identity, the token protocol,
  refresh-token rotation, and the credential file format.
- Claudeland reads the refresh token and passes it to the CLI through the child
  environment, never through argv, and never persists or logs it. ADR 002 is
  extended, not reversed: Claudeland still owns no credential storage.
- The renewal environment is a Claude Code contract. If it changes, automatic
  renewal degrades to the previous behaviour — an explicit sign-in action —
  rather than to a broken extension.
- The happy path no longer spawns any subprocess: the CLI is consulted only
  when the credential file is unusable or a renewal is required.
