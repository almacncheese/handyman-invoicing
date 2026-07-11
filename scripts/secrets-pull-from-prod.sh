#!/usr/bin/env bash
# Pull HandyQuote production secrets into macOS Keychain (this machine).
# Does not print secret values. Requires SSH to VPS + Keychain access.
set -euo pipefail

ACCT="${USER}"
VPS="${HANDYQUOTE_VPS:-root@72.62.169.186}"

kc_set() {
  local service="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "skip empty: $service"
    return 0
  fi
  # -U updates if exists
  security add-generic-password -a "$ACCT" -s "$service" -w "$value" -U >/dev/null 2>&1 \
    || security add-generic-password -a "$ACCT" -s "$service" -w "$value" >/dev/null
  echo "keychain ok: $service (len=${#value})"
}

echo "== Pull AUTH_SECRET + DB password from VPS =="
AUTH=$(ssh -o BatchMode=yes -o ConnectTimeout=15 "$VPS" 'cat /root/.handyquote-auth.secret 2>/dev/null' || true)
DBPASS=$(ssh -o BatchMode=yes -o ConnectTimeout=15 "$VPS" 'cat /root/.handyquote-db.pass 2>/dev/null' || true)
kc_set "handyquote_auth_secret" "$AUTH"
kc_set "handyquote_database_password" "$DBPASS"

echo "== Ensure platform admin password default is vaulted =="
# Only set if missing — do not overwrite a rotated password
if ! security find-generic-password -a "$ACCT" -s "handyquote_platform_admin_password" >/dev/null 2>&1; then
  kc_set "handyquote_platform_admin_password" "password1"
  echo "note: set initial platform admin password in Keychain (change in app, then re-run with new value)"
else
  echo "keychain already has: handyquote_platform_admin_password"
fi

echo "== Resend (if already in Keychain under resend_api_key, leave it) =="
if security find-generic-password -a "$ACCT" -s "resend_api_key" >/dev/null 2>&1; then
  echo "keychain already has: resend_api_key"
else
  echo "missing resend_api_key — add with: security add-generic-password -a \"\$USER\" -s resend_api_key -w 're_...' -U"
fi

echo "== Coolify env keys present (names only) =="
ssh -o BatchMode=yes -o ConnectTimeout=15 "$VPS" 'docker exec coolify php artisan tinker --execute="
\$app=App\\Models\\Application::where(\"name\",\"handyquote\")->first();
if(!\$app){echo \"no app\"; return;}
foreach(\$app->environment_variables as \$e){ echo \$e->key.PHP_EOL; }
"' 2>/dev/null | tail -20 || true

echo "DONE — secrets vaulted on this Mac (Keychain). Prod remains Coolify."
