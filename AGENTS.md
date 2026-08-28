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
- New response shapes have fixtures and parser tests.
- GNOME Shell version metadata matches versions actually tested.
- User-facing percentages are remaining capacity, not consumed capacity.
