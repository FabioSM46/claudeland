#!/usr/bin/env bash
# Verifies the built extension against every GNOME Shell release Claudeland
# declares in metadata.json, inside disposable containers.
#
#   scripts/verify-shell.sh          # every declared release
#   scripts/verify-shell.sh 50       # one release
#
# Each run starts a real GNOME Shell headlessly, enables the extension, and
# renders every panel and card state. Nothing touches the host session: the
# containers have no network and mock logind on a private bus.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"

if ! command -v docker >/dev/null; then
  echo "docker is required to run the GNOME Shell verification" >&2
  exit 1
fi

versions=("$@")
if [ ${#versions[@]} -eq 0 ]; then
  versions=(46 50)
fi

if [ ! -f dist/extension.js ]; then
  echo "dist/ is missing; run pnpm build first" >&2
  exit 1
fi

status=0
for version in "${versions[@]}"; do
  dockerfile="tests/shell/Dockerfile.gnome${version}"
  if [ ! -f "$dockerfile" ]; then
    echo "No container definition for GNOME Shell ${version}" >&2
    exit 1
  fi

  image="claudeland-verify-gnome${version}"
  echo "==> Building ${image}"
  docker build -q -f "$dockerfile" -t "$image" tests/shell >/dev/null

  echo "==> Verifying against GNOME Shell ${version}"
  if docker run --rm --network none \
      -v "$root/dist:/home/tester/dist:ro" \
      -v "$root/tests/shell/uicheck-extension.js:/home/tester/uicheck-extension.js:ro" \
      -v "$root/tests/shell/verify-in-container.sh:/home/tester/verify.sh:ro" \
      -e XDG_RUNTIME_DIR=/tmp/xdg \
      "$image" \
      sh -c 'mkdir -p /tmp/xdg && chmod 700 /tmp/xdg && dbus-run-session -- /home/tester/verify.sh 2>/tmp/all.log' \
      2>/dev/null | grep -E '^###|^ *ok |^state |^no JS|^unexpected|^ui probe|^preferences|passed|FAILED'; then
    :
  else
    status=1
    echo "GNOME Shell ${version} verification failed" >&2
  fi
done

exit $status
