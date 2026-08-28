# ADR 002: Delegate authentication to Claude Code

- Status: accepted
- Date: 2026-08-28

## Context

The project needs a browser-authenticated Claude subscription session. Browser
cookies are fragile and sensitive, while third-party consumer OAuth and usage
APIs are not publicly documented.

## Decision

Require Claude Code and delegate browser login to
`claude auth login --claudeai`. Read its existing local OAuth credential only
for the usage request; never copy the token into GSettings or project storage.

## Consequences

- The user sees Anthropic's official login flow.
- Claudeland does not own refresh-token storage.
- Claude Code credential-layout changes require adapter maintenance.
- The usage endpoint remains experimental and must fail safely.
