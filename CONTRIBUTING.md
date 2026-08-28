# Contributing

1. Branch from `develop`.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Make focused changes and add tests for domain behavior.
4. Run `pnpm check`.
5. Open a pull request targeting `develop`.

Use Conventional Commit subjects such as `feat: add compact panel mode` or
`fix: handle expired Claude credentials`.

GNOME UI changes should be tested in a nested Wayland session when possible.
On GNOME 48 and older:

```bash
dbus-run-session gnome-shell --nested --wayland
```
