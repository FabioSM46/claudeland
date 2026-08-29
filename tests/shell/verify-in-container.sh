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
cp -r /home/tester/dist/. "$EXT_DIR/$UUID/"
glib-compile-schemas "$EXT_DIR/$UUID/schemas"
rm -f "$EXT_DIR/$UUID/session-check.js" "$EXT_DIR/$UUID/smoke-test.js"

# The probe is a copy of the extension with a different entry point. Both
# cannot run in one session: GObject type names are derived from the module
# path, so a second copy would collide on registration.
cp -r "$EXT_DIR/$UUID" "$EXT_DIR/$PROBE"
cp /home/tester/uicheck-extension.js "$EXT_DIR/$PROBE/extension.js"
sed -i "s|\"$UUID\"|\"$PROBE\"|" "$EXT_DIR/$PROBE/metadata.json"
rm -f "$EXT_DIR/$PROBE/prefs.js"

gsettings set org.gnome.shell disable-user-extensions false

start_shell() {
  gsettings set org.gnome.shell enabled-extensions "['$1']"
  rm -f /tmp/shell.log
  gnome-shell --headless --no-x11 --virtual-monitor 1280x720 > /tmp/shell.log 2>&1 &
  SHELL_PID=$!
  i=0
  while [ $i -lt 45 ]; do
    if gnome-extensions info "$1" 2>/dev/null | grep -q "^  State:"; then
      break
    fi
    i=$((i + 1))
    sleep 1
  done
  sleep 5
}

stop_shell() {
  kill "$SHELL_PID" 2>/dev/null || true
  wait "$SHELL_PID" 2>/dev/null || true
  sleep 1
}

echo "### $(gnome-shell --version) · $(gjs --version | head -1)"

echo
echo "=== phase 0: domain and services under this GJS ==="
gjs -m /home/tester/dist/smoke-test.js || STATUS=1
gjs -m /home/tester/dist/session-check.js || STATUS=1

echo
echo "=== phase 1: the extension itself ==="
start_shell "$UUID"
STATE=$(gnome-extensions info "$UUID" 2>/dev/null | sed -n 's/^  State: //p')
echo "state after startup: ${STATE:-unknown}"
[ "$STATE" = "ACTIVE" ] || STATUS=1
gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
sleep 2
gnome-extensions enable "$UUID" >/dev/null 2>&1 || true
sleep 3
STATE=$(gnome-extensions info "$UUID" 2>/dev/null | sed -n 's/^  State: //p')
echo "state after a disable/enable cycle: ${STATE:-unknown}"
[ "$STATE" = "ACTIVE" ] || STATUS=1
if grep -qiE "JS ERROR|JS WARNING" /tmp/shell.log; then
  echo "unexpected shell errors:"
  grep -iE "JS ERROR|JS WARNING" /tmp/shell.log
  STATUS=1
else
  echo "no JS errors or warnings in the journal"
fi
stop_shell

echo
echo "=== phase 2: rendering every panel and card state ==="
start_shell "$PROBE"
if grep -q "CLAUDELAND UI CHECK OK" /tmp/shell.log; then
  echo "ui probe: OK"
else
  echo "ui probe: FAILED"
  grep -iE "CLAUDELAND UI CHECK|JS ERROR|claudeland" /tmp/shell.log || echo "(no probe output)"
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
