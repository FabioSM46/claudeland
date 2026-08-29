# Changelog

All notable changes to this project will be documented in this file. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Automatic session renewal. When the Claude access token has expired, or an
  authenticated request is rejected, Claudeland asks the Claude Code CLI to
  renew the session non-interactively and retries once. Sign-in is requested
  only when the refresh token is missing, expired, or rejected.
- GNOME Shell 50 compatibility metadata, type validation, and runtime smoke
  testing while retaining GNOME Shell 46 support.

### Changed

- Consult the Claude Code CLI only when the credential file is unusable or a
  renewal is required, so ordinary polling no longer spawns a subprocess.
- Align lifecycle, signal cleanup, imports, and actor orientation with current
  GNOME Extensions review guidance.
- Prepare a minimal extensions.gnome.org package without unnecessary compiled
  schemas or unreachable JavaScript.
- Expand extension metadata with Claude Code, OAuth credential, Anthropic
  endpoint, and unofficial-project disclosures.

### Fixed

- Stop demanding a browser sign-in after the access token expires. An eight-hour
  access token expiring overnight left the panel asking for a login even though
  the session remained renewable for weeks.
- Apply warning and critical colors to percentage text without painting its
  background, while preserving the matching progress-bar colors.
- Keep bottom-positioned desktop cards inside the monitor after their content
  changes height.

## [0.1.0] - 2026-08-28

### Added

- Initial GNOME Shell extension architecture.
- Claude Code authentication integration.
- Five-hour, weekly, and dynamic model-scoped limit display.
- Optional non-interactive desktop card.
- System-locale support through gettext with English fallback and Italian
  translations.
- Claude plan tier in the usage header, including Max 5x/20x detection.

### Fixed

- Keep the usage popup open when selecting “Refresh now”.

[Unreleased]: https://github.com/FabioSM46/claudeland/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/FabioSM46/claudeland/releases/tag/v0.1.0
