#!/usr/bin/env bash
# Verifies the built extension against every GNOME Shell release Claudeland
# declares, inside disposable containers.
#
#   scripts/verify-shell.sh          # every declared release
#   scripts/verify-shell.sh 42 50    # selected releases
#
# Releases before 45 load the legacy package built from the same sources; 45 and
# later load the ES module package. Each run starts a real GNOME Shell
# headlessly, enables the extension, and renders every panel and card state.
# Nothing touches the host session: the containers have no network and mock
# logind on a private bus.
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$root"

if ! command -v docker >/dev/null; then
  echo "docker is required to run the GNOME Shell verification" >&2
  exit 1
fi

declared() {
  node -e "
    const fs = require('node:fs');
    const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))['shell-version'];
    const all = [...read('metadata.json'), ...read('metadata-legacy.json')];
    console.log(all.map(Number).sort((a, b) => a - b).join(' '));
  "
}

versions=("$@")
if [ ${#versions[@]} -eq 0 ]; then
  read -r -a versions <<< "$(declared)"
fi

if [ ! -f dist/extension.js ] || [ ! -f dist-legacy/extension.js ]; then
  echo "dist/ or dist-legacy/ is missing; run pnpm build first" >&2
  exit 1
fi

status=0
for version in "${versions[@]}"; do
  dockerfile="tests/shell/Dockerfile.gnome${version}"
  if [ ! -f "$dockerfile" ]; then
    echo "No container definition for GNOME Shell ${version}" >&2
    exit 1
  fi

  if [ "$version" -lt 45 ]; then
    package="$root/dist-legacy"
    probe="$root/dist-legacy-probe/extension.js"
  else
    package="$root/dist"
    probe="$root/tests/shell/uicheck-extension.js"
  fi

  image="claudeland-verify-gnome${version}"
  echo "==> Building ${image}"
  docker build -q -f "$dockerfile" -t "$image" tests/shell >/dev/null

  echo "==> Verifying against GNOME Shell ${version}"
  if docker run --rm --network none \
      -v "$package:/home/tester/package:ro" \
      -v "$root/dist:/home/tester/modern:ro" \
      -v "$probe:/home/tester/uicheck-extension.js:ro" \
      -v "$root/tests/shell/open-window.js:/home/tester/open-window.js:ro" \
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
