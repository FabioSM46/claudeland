# AGENTS.md

## Project

Claudeland is a GNOME Shell extension for Ubuntu Wayland. It shows the
remaining Claude subscription capacity for the current five-hour window,
weekly limits, and dynamically discovered model-scoped limits.

## Required workflow

- Work on `develop`; release branches and `main` are protected integration
  targets.
- Use `pnpm` for dependency and script management.
- Run `pnpm check` before committing.
- Keep pure data normalization in `src/domain/`; it must remain runnable under
  Node and covered by unit tests.
- Keep GNOME-specific imports out of `src/domain/`.
- Treat every response from the usage endpoint as untrusted input.
- Never log, persist, commit, mock with, or expose a real OAuth access token,
  refresh token, email address, or organization identifier.
- Do not add browser-cookie scraping. Authentication must remain delegated to
  the Claude Code CLI.
- Do not implement the OAuth token protocol. Session renewal is delegated to
  the Claude Code CLI, which owns the client identity, refresh-token rotation,
  and the credential file format (ADR 003).
- The refresh token may only be held in memory and handed to the CLI through
  the child environment. Never place it in argv, GSettings, a log, or a file.
- An expired access token is not an expired session. Prompt for sign-in only
  when the refresh token is missing, expired, or rejected.
- The OAuth usage endpoint is undocumented. Keep it isolated in
  `src/services/claude-usage-client.ts` and tolerate compatible schema changes.
- Do not hard-code Fable or other future models into the parser. Scoped limits
  must be discovered dynamically.
- Write source and fallback strings in English. Wrap every user-facing string
  with gettext and update `po/claudeland.pot`; never hard-code Italian in code.
- Clean up every GNOME signal, timeout, file monitor, and actor in `disable()`
  or `destroy()`.
- Avoid synchronous network or filesystem work on the GNOME Shell main loop.

## Architecture boundaries

- `src/domain`: types, normalization, formatting, severity decisions.
- `src/services`: credentials, Claude Code authentication, HTTP adapter.
- `src/ui`: GNOME Shell actors and menu components.
- `extension.ts`: composition root and lifecycle only.
- `prefs.ts`: preferences process; never import Shell, St, or Clutter here.

## Review checklist

- No secret values appear in code, fixtures, snapshots, errors, or logs.
- A failed/expired login produces a recoverable UI state.
- HTTP 401 and 429 have explicit behavior.
- Automatic renewal is attempted at most once per request cycle and backs off
  after a failure.
- New response shapes have fixtures and parser tests.
- GNOME Shell version metadata matches versions actually tested. Every release
  declared in `metadata.json` passes `pnpm verify:shell`, and a newly declared
  release has a container definition in `tests/shell/`.
- User-facing percentages are remaining capacity, not consumed capacity.
