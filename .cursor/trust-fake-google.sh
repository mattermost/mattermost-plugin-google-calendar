#!/usr/bin/env bash
# Makes the agent's browser trust the fake Google's throwaway CA, so its consent pages load as
# https://accounts.google.com without certificate errors. Chrome on Linux reads trusted CAs from the
# user's NSS database; the system store is updated too for curl and other tools. The CA lives in the
# stack's certs volume and is regenerated after `make e2e-env-down`, so this runs after every
# `make e2e-env-up` (install.sh and the e2e-stack terminal) and replaces the previous one.
set -euo pipefail

export E2E_FAKE_HTTPS_PORT="${E2E_FAKE_HTTPS_PORT:-443}"

cd "$(dirname "$0")/../e2e/playwright"

ca="$(mktemp)"
trap 'rm -f "$ca"' EXIT
docker compose --profile fake run --rm --no-deps -T --entrypoint cat certs /certs/ca.crt > "$ca"

nssdb="sql:$HOME/.pki/nssdb"
mkdir -p "$HOME/.pki/nssdb"
[[ -f "$HOME/.pki/nssdb/cert9.db" ]] || certutil -d "$nssdb" -N --empty-password
certutil -d "$nssdb" -D -n "Fake Google E2E CA" 2>/dev/null || true
certutil -d "$nssdb" -A -t "C,," -n "Fake Google E2E CA" -i "$ca"

sudo cp "$ca" /usr/local/share/ca-certificates/fake-google-e2e.crt
sudo update-ca-certificates --fresh >/dev/null

echo "Trusted the fake Google CA for the browser."
