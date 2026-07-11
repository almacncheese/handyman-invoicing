#!/usr/bin/env bash
# Set one Keychain secret: scripts/secrets-set-keychain.sh <service> <value>
# Example: bash scripts/secrets-set-keychain.sh handyquote_r2_access_key_id 'xxx'
set -euo pipefail
SERVICE="${1:-}"
VALUE="${2:-}"
if [[ -z "$SERVICE" || -z "$VALUE" ]]; then
  echo "Usage: $0 <service-name> <secret-value>"
  echo "Services: see scripts/secrets-inventory.md"
  exit 1
fi
security add-generic-password -a "$USER" -s "$SERVICE" -w "$VALUE" -U >/dev/null 2>&1 \
  || security add-generic-password -a "$USER" -s "$SERVICE" -w "$VALUE" >/dev/null
echo "keychain ok: $SERVICE (len=${#VALUE})"
