# Changelog

All notable changes to this project will be documented in this file. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Limit the extensions.gnome.org package to GNOME Shell 45 through 50, keeping
  the submitted JavaScript modular and removing the legacy transpilation path.
- Use libsoup 3 directly and remove the unused libsoup 2.4 transport fallback.

### Removed

- The rejected GNOME Shell 42 through 44 package, its build shims, compatibility
  UI fallbacks, and legacy container definitions.

## [0.3.0] - 2026-09-03

### Added

- Support for GNOME Shell 42, 43 and 44. Those releases predate the ES module
  extension API introduced in Shell 45, so the build now produces a second
  package from the same sources, bundled as legacy scripts. `pnpm dev:install`
  installs whichever package matches the running Shell, and `pnpm package`
  produces both archives.
- Compatibility metadata for GNOME Shell 45, 47, 48 and 49, completing the
  supported range from 42 to 50.
- Container definitions and verification runs for every newly declared release,
  so all nine are exercised against a real headless Shell.
- A blank line between functions and classes in the packaged JavaScript, as the
  extensions.gnome.org review asks for. The TypeScript sources already complied;
  the emitters dropped those lines, and `scripts/format-output.mjs` restores
  them in both packages.
- A libsoup 2.4 fallback for the usage request. Ubuntu 22.04, which carries
  GNOME Shell 42, installs no libsoup 3 introspection data by default.
- A libadwaita fallback for the preferences rows, which are built from an
  `Adw.ActionRow` and a `Gtk` control on libadwaita older than 1.4.

### Changed

- Documentation no longer describes Claudeland as Ubuntu- or Wayland-specific.
  It runs on any distribution shipping a supported GNOME Shell, under X11 and
  Wayland alike.

## [0.2.0] - 2026-08-30

### Added

- Automatic session renewal. When the Claude access token has expired, or an
  authenticated request is rejected, Claudeland asks the Claude Code CLI to
  renew the session non-interactively and retries once. Sign-in is requested
  only when the refresh token is missing, expired, or rejected.
- GNOME Shell 50 compatibility metadata, type validation, and runtime smoke
  testing while retaining GNOME Shell 46 support. Both releases are now
  verified automatically with `pnpm verify:shell`, which starts a real headless
  GNOME Shell in a container, activates the extension, opens its preferences
  dialog, and renders every panel and card state.
- A GJS harness for credential reading and session renewal, covering what the
  Node tests cannot reach: `Gio` file access and the subprocess handover to the
  Claude Code CLI.
- Submission notes for extensions.gnome.org documenting every subprocess the
  extension launches and why.

### Changed

- Consult the Claude Code CLI only when the credential file is unusable or a
  renewal is required, so ordinary polling no longer spawns a subprocess.
- Place the desktop card through public shell API instead of `LayoutManager`'s
  private background group. The card keeps its position above the wallpaper and
  below application windows: it is parented into the wallpaper's own group,
  because a sibling of the window actors is restacked above them by mutter as
  soon as a window appears. The stacking is asserted against a window opened
  after the card on every supported GNOME Shell release.
- Align lifecycle, signal cleanup, imports, and actor orientation with current
  GNOME Extensions review guidance.
- Apply consistent source formatting with Prettier and verify it in `pnpm check`.
- Prepare a minimal extensions.gnome.org package without unnecessary compiled
  schemas or unreachable JavaScript, verify release-version consistency, and
  generate its SHA-256 checksum automatically.
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

[Unreleased]: https://github.com/FabioSM46/claudeland/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/FabioSM46/claudeland/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/FabioSM46/claudeland/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/FabioSM46/claudeland/releases/tag/v0.1.0
