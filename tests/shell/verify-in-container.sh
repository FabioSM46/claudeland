#!/bin/sh
# Runs inside the verification container, never on a real session.
#
# Phase 1 starts GNOME Shell with the packaged extension and checks that it
# activates, survives a disable/enable cycle, and logs nothing. Phase 2 starts
# the shell again with the UI probe, which renders every panel and card state.
#
# The two phases cannot share one shell: GObject type names are derived from
# the module path, so a second copy of the same actors collides on
# registration.
set -e
UUID=claudeland@fabiosm46.dev
PROBE=uicheck@claudeland.test
EXT_DIR="$HOME/.local/share/gnome-shell/extensions"
STATUS=0

# A private system bus with a mocked logind, so GNOME Shell can start without
# systemd and without touching the host session.
DBUS_SYSTEM_BUS_ADDRESS=$(dbus-daemon --config-file=/usr/share/dbus-1/session.conf --print-address --fork 2>/dev/null || true)
if [ -z "$DBUS_SYSTEM_BUS_ADDRESS" ]; then
  echo "could not start the private system bus" >&2
  exit 1
fi
export DBUS_SYSTEM_BUS_ADDRESS
python3 -m dbusmock --system --template logind > /tmp/logind.log 2>&1 &
sleep 3

mkdir -p "$EXT_DIR/$UUID"
cp -r /home/tester/package/. "$EXT_DIR/$UUID/"
glib-compile-schemas "$EXT_DIR/$UUID/schemas"

# The probe is a copy of the extension with a different entry point. Both
# cannot run in one session: GObject type names are derived from the module
# path, so a second copy would collide on registration.
cp -r "$EXT_DIR/$UUID" "$EXT_DIR/$PROBE"
cp /home/tester/uicheck-extension.js "$EXT_DIR/$PROBE/extension.js"
sed -i "s|\"$UUID\"|\"$PROBE\"|" "$EXT_DIR/$PROBE/metadata.json"
rm -f "$EXT_DIR/$PROBE/prefs.js"

gsettings set org.gnome.shell disable-user-extensions false

# start_shell <uuid to enable, empty for none> [uuid to wait for]
start_shell() {
  if [ -n "$1" ]; then
    gsettings set org.gnome.shell enabled-extensions "['$1']"
  else
    gsettings set org.gnome.shell enabled-extensions "[]"
  fi
  awaited=${2:-$1}
  rm -f /tmp/shell.log
  gnome-shell --headless --no-x11 --virtual-monitor 1280x720 > /tmp/shell.log 2>&1 &
  SHELL_PID=$!
  i=0
  while [ $i -lt 45 ]; do
    if gnome-extensions info "$awaited" 2>/dev/null | grep -q "^  State:"; then
      break
    fi
    i=$((i + 1))
    sleep 1
  done
  sleep 5
}

# Errors GNOME Shell itself raises in a container, with no bearing on the
# extension under test. Keep this list minimal and exact.
#
shell_errors() {
  grep -iE "JS ERROR|JS WARNING" /tmp/shell.log || true
}

is_active() {
  [ "$1" = "ACTIVE" ]
}

stop_shell() {
  for pid in $WINDOW_PIDS; do
    kill "$pid" 2>/dev/null || true
  done
  WINDOW_PIDS=""
  kill "$SHELL_PID" 2>/dev/null || true
  wait "$SHELL_PID" 2>/dev/null || true
  sleep 1
}

# open_window <name>: a real client window on the shell's Wayland socket.
WINDOW_PIDS=""
open_window() {
  WAYLAND_DISPLAY=wayland-0 GDK_BACKEND=wayland gjs -m /home/tester/open-window.js "$1" \
    >/dev/null 2>&1 &
  WINDOW_PIDS="$WINDOW_PIDS $!"
  sleep 4
}

echo "### $(gnome-shell --version) · $(gjs --version | head -1)"

echo
echo "=== phase 0: domain and services under this GJS ==="
# These harnesses are run by gjs directly rather than by the Shell.
gjs -m /home/tester/modern/smoke-test.js || STATUS=1
gjs -m /home/tester/modern/session-check.js || STATUS=1

echo
echo "=== phase 1: the extension itself ==="
start_shell "$UUID"
STATE=$(gnome-extensions info "$UUID" 2>/dev/null | sed -n 's/^  State: //p')
echo "state after startup: ${STATE:-unknown}"
is_active "$STATE" || STATUS=1
gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
sleep 2
gnome-extensions enable "$UUID" >/dev/null 2>&1 || true
sleep 3
STATE=$(gnome-extensions info "$UUID" 2>/dev/null | sed -n 's/^  State: //p')
echo "state after a disable/enable cycle: ${STATE:-unknown}"
is_active "$STATE" || STATUS=1
if shell_errors > /tmp/errors.log && [ -s /tmp/errors.log ]; then
  echo "unexpected shell errors:"
  cat /tmp/errors.log
  STATUS=1
else
  echo "no JS errors or warnings in the journal"
fi

# The preferences dialog runs in its own GTK process, against a different
# library stack than the shell, so it needs its own check. The Extensions app
# reports a failing prefs.js as "Failed to open preferences".
WAYLAND_DISPLAY=wayland-0 GDK_BACKEND=wayland gnome-extensions prefs "$UUID" >/dev/null 2>&1 || true
sleep 8
if [ ! -f /tmp/all.log ]; then
  echo "preferences: SKIPPED (stderr was not captured to /tmp/all.log)"
  STATUS=1
elif grep -q "Failed to open preferences" /tmp/all.log; then
  echo "preferences: FAILED"
  grep -A3 "Failed to open preferences" /tmp/all.log | head -8
  STATUS=1
else
  echo "preferences opened without error"
fi
stop_shell

echo
echo "=== phase 2: rendering every panel and card state ==="
# One window before the card is built and one after it. The second is what
# makes the stacking check meaningful: mutter reorders the window group only
# when a window appears, and that is when a card parented next to the window
# actors instead of inside the wallpaper group floats to the front.
start_shell "" "$PROBE"
open_window before
gnome-extensions enable "$PROBE" >/dev/null 2>&1 || true
sleep 3
open_window after
i=0
while [ $i -lt 40 ]; do
  grep -qE "CLAUDELAND UI CHECK" /tmp/shell.log && break
  i=$((i + 1))
  sleep 1
done
if grep -q "CLAUDELAND UI CHECK OK" /tmp/shell.log; then
  echo "ui probe: OK"
else
  echo "ui probe: FAILED"
  grep -iE "CLAUDELAND UI CHECK|CLAUDELAND UI LAYERS|JS ERROR|claudeland" /tmp/shell.log || echo "(no probe output)"
  STATUS=1
fi
stop_shell

echo
if [ $STATUS -eq 0 ]; then
  echo "GNOME Shell verification passed"
else
  echo "GNOME Shell verification FAILED"
fi
exit $STATUS
