#!/usr/bin/env bash
# Start the app for the client to try on their own phone.
#   scripts/demo.sh              current branch
#   scripts/demo.sh --clear      clear the Metro cache first
. "$(dirname "$0")/lib.sh"
cd "$ROOT"

[ -d node_modules ] || { say "installing dependencies"; npm install; }

printf '\n%sVitals — %s%s\n' "$BOLD" "$(git rev-parse --abbrev-ref HEAD)" "$OFF"
printf '%sScan the QR code below with Expo Go (iPhone: Camera app; Android: Expo Go).%s\n' "$DIM" "$OFF"
printf '%sBoth phones must be on the same Wi-Fi. Add --tunnel if they are not.%s\n\n' "$DIM" "$OFF"

exec npx expo start "$@"
