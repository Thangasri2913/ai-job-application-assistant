#!/usr/bin/env bash
# Forwards the phone's localhost ports to this computer over USB (adb reverse), so the app on a
# USB-connected Android phone reaches Metro (8081), the API (3000) and Keycloak (8180) at
# http://localhost:… — nothing is exposed on the network. Android drops these forwards whenever
# the phone reconnects or adb restarts, so run this again after replugging.
set -euo pipefail

ADB="$(command -v adb || true)"
for candidate in "${ANDROID_HOME:-}/platform-tools/adb" "$HOME/Android/Sdk/platform-tools/adb"; do
  [[ -z "$ADB" && -x "$candidate" ]] && ADB="$candidate"
done
if [[ -z "$ADB" ]]; then
  echo "adb not found. Install Android platform-tools or set ANDROID_HOME." >&2
  exit 1
fi

if ! "$ADB" get-state >/dev/null 2>&1; then
  echo "No Android device connected. Plug in the phone, allow USB debugging, then retry." >&2
  exit 1
fi

for port in 8081 3000 8180; do
  "$ADB" reverse "tcp:$port" "tcp:$port" >/dev/null
done
echo "USB forwarding active on the phone:"
"$ADB" reverse --list
