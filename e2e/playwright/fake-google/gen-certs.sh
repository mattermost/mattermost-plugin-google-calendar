#!/bin/sh
# Creates a throwaway CA and a certificate for the Google hosts the fake answers for, then a CA
# bundle (system roots plus the throwaway CA) for Mattermost's SSL_CERT_FILE. Runs in the compose
# `certs` service; idempotent, and regenerates when the host list below changes.
#
# The API hosts are network aliases of the fake (docker-compose.yml). accounts.google.com is only
# reached by the browser, through Chromium's --host-resolver-rules (lib/browser.ts).
set -eu

HOSTS="www.googleapis.com people.googleapis.com oauth2.googleapis.com accounts.google.com"

OUT=/certs
cd "$OUT"

if [ -f fake.crt ] && [ -f ca-bundle.crt ] && [ "$(cat hosts 2>/dev/null)" = "$HOSTS" ]; then
  exit 0
fi

SAN=""
for host in $HOSTS; do
  SAN="${SAN:+$SAN,}DNS:$host"
done

openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -keyout ca.key -out ca.crt \
  -subj "/CN=Fake Google E2E CA" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"

openssl req -newkey rsa:2048 -nodes -keyout fake.key -out fake.csr -subj "/CN=www.googleapis.com"
printf "subjectAltName=%s\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n" "$SAN" > san.ext
openssl x509 -req -in fake.csr -CA ca.crt -CAkey ca.key -CAcreateserial -days 825 -extfile san.ext -out fake.crt

cat /etc/ssl/certs/ca-certificates.crt ca.crt > ca-bundle.crt
printf "%s" "$HOSTS" > hosts
chmod 644 ./*
