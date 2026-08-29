# ADR 001: Use a GNOME Shell extension

- Status: accepted
- Date: 2026-08-28

## Context

The widget must run on Ubuntu Wayland without remaining above application
windows. Wayland does not let ordinary clients dictate global stacking.

## Decision

Use TypeScript compiled to GJS as a GNOME Shell extension. Provide a panel
indicator as the stable surface and an optional background actor as the desktop
surface.

## Consequences

- The behavior is native and efficient on GNOME.
- GNOME release compatibility requires ongoing testing.
- Other compositors require their own frontend.
- The desktop card depends on the wallpaper's actor group, located through
  public API, until GNOME exposes an appropriate stable API for desktop
  widgets.
