#!/bin/sh
# Substitute the actual DNS resolver from /etc/resolv.conf into the nginx
# template, so we don't hardcode 127.0.0.11 (Docker) when running on Railway
# (which uses its own DNS) or anywhere else.
#
# Runs before /docker-entrypoint.d/20-envsubst-on-templates.sh.
set -e

RESOLVER=$(awk '/^nameserver/{ printf "%s ", $2 }' /etc/resolv.conf 2>/dev/null)
if [ -z "$RESOLVER" ]; then
  RESOLVER="127.0.0.11 8.8.8.8"
fi

echo "[entrypoint] nginx resolver: $RESOLVER"

# Replace the placeholder in every template.
for f in /etc/nginx/templates/*.template; do
  [ -f "$f" ] || continue
  sed -i "s|@@RESOLVER@@|${RESOLVER}|g" "$f"
done
