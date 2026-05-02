#!/bin/sh
# Substitute the actual DNS resolver from /etc/resolv.conf into the nginx
# template, so we don't hardcode 127.0.0.11 (Docker) when running on Railway
# (which uses its own DNS) or anywhere else.
#
# IPv6 nameservers must be wrapped in brackets ([fd12::10]) for nginx,
# otherwise the colons are parsed as host:port.
#
# Runs before /docker-entrypoint.d/20-envsubst-on-templates.sh.
set -e

RESOLVER=""
while read -r key value rest; do
  [ "$key" = "nameserver" ] || continue
  case "$value" in
    *:*)  # IPv6 — needs brackets
      RESOLVER="$RESOLVER [${value}]"
      ;;
    *)
      RESOLVER="$RESOLVER ${value}"
      ;;
  esac
done < /etc/resolv.conf

# Trim leading whitespace.
RESOLVER=$(echo "$RESOLVER" | sed 's/^ *//')

if [ -z "$RESOLVER" ]; then
  RESOLVER="127.0.0.11 8.8.8.8"
fi

echo "[entrypoint] nginx resolver: $RESOLVER"

# Replace the placeholder in every template.
for f in /etc/nginx/templates/*.template; do
  [ -f "$f" ] || continue
  sed -i "s|@@RESOLVER@@|${RESOLVER}|g" "$f"
done
