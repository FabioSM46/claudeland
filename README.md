# Claudeland

Claudeland is a GNOME Shell extension for Ubuntu Wayland that keeps Claude plan
capacity visible without placing an always-on-top application over your work.

It displays remaining capacity for:

- the current five-hour usage window;
- the all-model weekly window;
- model-scoped weekly limits discovered at runtime, such as Fable;
- any compatible limits Anthropic adds to the response in the future.

> [!WARNING]
> Anthropic does not currently document the OAuth usage endpoint used by Claude
> Code's usage screen. Claudeland isolates that integration behind one adapter,
> but a Claude Code or server-side change may temporarily break live data.

## Status

The project is at `0.1.0` and currently targets GNOME Shell 46. The development
and verification environment is Ubuntu with GNOME Shell 46 on Wayland.

## Why a GNOME extension?

Wayland intentionally prevents ordinary applications from controlling their
global position and stacking order. A GTK, Qt, Electron, or Tauri window cannot
reliably behave like a desktop widget below every application on stock GNOME.
Claudeland therefore integrates with GNOME Shell directly:

- the panel indicator is the stable default;
- the optional desktop card is placed in GNOME's background actor group and is
  non-interactive, so it does not cover application windows or steal input.

## Requirements

- Ubuntu or another GNOME distribution using GNOME Shell 46;
- Wayland or X11 (Wayland is the primary target);
- Claude Code installed and available as `claude` in `PATH`;
- a Claude subscription authenticated through Claude Code;
- Git, Node.js 20.19+, and pnpm 9+ when installing from source.

Check authentication with:

```bash
claude auth status --json
```

If needed, log in through the official browser flow:

```bash
claude auth login --claudeai
```

Claudeland never asks for browser cookies and does not save a second copy of
your credential.

## Install the pre-release

Download these two assets from the
[v0.1.0 pre-release](https://github.com/FabioSM46/claudeland/releases/tag/v0.1.0):

- `claudeland@fabiosm46.dev.shell-extension.zip`;
- `claudeland@fabiosm46.dev.shell-extension.zip.sha256`.

In a terminal, change to the download directory, verify the archive, and
install it for the current user:

```bash
sha256sum --check claudeland@fabiosm46.dev.shell-extension.zip.sha256
gnome-extensions install --force claudeland@fabiosm46.dev.shell-extension.zip
```

Log out and back in after the first installation, then enable it:

```bash
gnome-extensions enable claudeland@fabiosm46.dev
```

On X11, GNOME Shell can instead be restarted with `Alt+F2`, `r`, Enter. That
restart shortcut is intentionally unavailable on Wayland.

Verify the installation and open preferences with:

```bash
gnome-extensions info claudeland@fabiosm46.dev
gnome-extensions prefs claudeland@fabiosm46.dev
```

## Install from source

Clone the public repository, install the locked development dependencies, and
install the extension for your user:

```bash
git clone https://github.com/FabioSM46/claudeland.git
cd claudeland
corepack enable
pnpm install --frozen-lockfile
pnpm dev:install
```

Then follow the same logout, enable, and verification steps shown above.

## Update

For a pre-release installation, download the assets for the newer version,
verify the checksum, and run `gnome-extensions install --force` again.

For a source installation, update the checkout and reinstall the extension:

```bash
cd claudeland
git switch main
git pull --ff-only
pnpm install --frozen-lockfile
pnpm dev:install
```

Log out and back in to reload the updated extension on Wayland.

## Uninstall

```bash
gnome-extensions disable claudeland@fabiosm46.dev
gnome-extensions uninstall claudeland@fabiosm46.dev
```

## Commands

| Command | Purpose |
|---|---|
| `pnpm build` | Transpile GJS code and copy extension assets |
| `pnpm check` | Lint, typecheck, test, and build |
| `pnpm test` | Run parser/domain unit tests |
| `pnpm dev:install` | Build and install into the user extension directory |
| `pnpm package` | Produce an installable extension ZIP in `build/` |
| `pnpm clean` | Remove generated `dist/`, `build/`, and `coverage/` |

## Testing the UI

GNOME 48 and older can run a nested Wayland shell:

```bash
dbus-run-session gnome-shell --nested --wayland
```

GNOME 49+ uses Mutter DevKit. On Ubuntu install `mutter-dev-bin`, then run:

```bash
dbus-run-session gnome-shell --devkit --wayland
```

Follow logs with:

```bash
journalctl --user -f -o cat /usr/bin/gnome-shell
```

## Authentication and data flow

```text
Claude Code browser login
          │
          ▼
~/.claude/.credentials.json
          │ read on demand, never copied
          ▼
ClaudeUsageClient ── HTTPS ──> Anthropic OAuth usage endpoint
          │
          ▼
normalizeUsage() ──> UsageSnapshot ──> panel + desktop card
```

The extension polls at a configurable interval, with a minimum of one minute.
It does not send prompts or create Claude conversations. A `401` asks the user
to authenticate again; a `429` preserves the last valid snapshot and backs off.

## Privacy

- No analytics or telemetry.
- No browser-cookie access.
- No account identifiers in settings.
- No real API responses or credentials in test fixtures.
- Usage data stays in memory and is discarded when the extension is disabled.

## Languages

English is the source and fallback language. Claudeland follows the GNOME
system locale through gettext; Italian is included in the initial release.
Translations live in `po/` and are compiled into the extension during build.

See [SECURITY.md](SECURITY.md) for the threat model.

## Repository layout

```text
src/domain/       Pure types, normalization, formatting
src/services/     Claude credentials, auth, and HTTP adapter
src/ui/           GNOME Shell indicator and desktop actor
schemas/          GSettings schema
tests/            Unit tests and synthetic fixtures
scripts/          Reproducible build/install/pack commands
docs/             Architecture decisions and roadmap
```

## Limitations

- The usage endpoint is undocumented and may change without notice.
- The desktop card uses a GNOME Shell internal background group because no
  stable public API exists for third-party desktop widgets.
- A normal “daily quota” is not provided by Claude subscriptions. Claudeland
  shows the official five-hour and weekly windows instead.
- KDE Plasma, Sway, and Hyprland need separate frontends; they are not GNOME
  Shell and cannot load this extension.

## Forking and attribution

Claudeland does not accept external code contributions or pull requests. Bug
reports may still be submitted through the issue tracker, and vulnerabilities
must be reported privately as described in [SECURITY.md](SECURITY.md).

Forks are permitted under the MIT License. Forks and redistributions must keep
the original `LICENSE` file and its copyright notice, which identifies
[FabioSM46](https://github.com/FabioSM46) as the original author. Forks are
independent projects and must not imply official status or endorsement.

## License

[MIT](LICENSE)
