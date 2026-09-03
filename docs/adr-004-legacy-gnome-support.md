# ADR 004: Ship a second package for GNOME Shell 42 to 44

- Status: superseded
- Date: 2026-09-03
- Superseded: 2026-09-03, after extensions.gnome.org review recommended
  withdrawing the legacy package

## Context

GNOME Shell 45 replaced the extension API with ES modules. Releases 42 to 44
load `extension.js` and `prefs.js` as plain scripts through the `imports`
object and call a module-level `init()`, so the package built for Shell 45 and
later cannot be loaded at all on them: it fails to parse.

Those releases still carry a large installed base, most visibly Ubuntu 22.04
LTS with Shell 42. Supporting them is what makes Claudeland available beyond
recent distributions.

Three runtime differences accompany the API change. libadwaita gained
`SwitchRow` and `SpinRow` in 1.4, which Shell 42 to 44 predate. GNOME Shell
moved to libsoup 3 in release 43, and Ubuntu 22.04 installs only the libsoup 2.4
introspection data. `St.BoxLayout` gained an `orientation` property after Shell 46.

## Decision

Keep one TypeScript source tree written against the modern API, and produce two
packages from it. `scripts/build-legacy.mjs` bundles the sources into one legacy
script per entry point, resolving every `gi://` and `resource://` import to its
`imports` equivalent through the shims in `scripts/legacy/shims`. Both packages
carry the same uuid and version and declare disjoint `shell-version` ranges, so
extensions.gnome.org serves whichever matches the visitor's release.

Runtime differences that a build cannot resolve are handled in the sources, each
behind a capability check rather than a version comparison.

## Consequences

- The legacy API surface is confined to the shims. An import with no legacy
  equivalent fails the build rather than a user's session.
- Every declared release, old and new, is verified against a real headless
  GNOME Shell before publication; `pnpm verify:shell` picks the package each
  release would actually receive.
- The legacy package is a single bundled script, so a stack trace from Shell 42
  to 44 does not name the source module.
- A new dependency on esbuild, used only by the build.
- Publishing a release means uploading two archives instead of one.

## Superseding decision

Claudeland now supports GNOME Shell 45 and later with one modular ES module
package. The legacy package was rejected during extensions.gnome.org review;
maintaining and reviewing a second, monolithic transpiled package was judged to
cost more than the additional coverage justified. The legacy build, shims,
libsoup 2.4 transport, old libadwaita fallbacks, and Shell 42–44 verification
containers were removed together so no unreachable compatibility code remains
in the modern package.
