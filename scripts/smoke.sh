#!/usr/bin/env bash
# End-to-end API smoke (no live card payments)
set -euo pipefail
BASE="${1:-http://localhost:3000}"
COOKIE="$(mktemp)"
trap 'rm -f "$COOKIE"' EXIT

json_field() {
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); const p=process.argv[1].split('.'); let v=j; for (const k of p) v=v?.[k]; if(v==null){console.error('missing',process.argv[1],d.slice(0,200)); process.exit(2)}; console.log(v)})" "$1"
}

echo "== health =="
curl -sS "$BASE/api/health" | grep -q '"ok":true'

DEMO_EMAIL="${DEMO_EMAIL:-demo@quickhandyquote.com}"

echo "== login ($DEMO_EMAIL) =="
LOGIN_BODY=$(curl -sS -c "$COOKIE" -b "$COOKIE" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$DEMO_EMAIL\",\"password\":\"demo-demo-demo\"}")
if ! echo "$LOGIN_BODY" | grep -q '"email"'; then
  DEMO_EMAIL="demo@handyquote.local"
  echo "  retry with $DEMO_EMAIL"
  LOGIN_BODY=$(curl -sS -c "$COOKIE" -b "$COOKIE" -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$DEMO_EMAIL\",\"password\":\"demo-demo-demo\"}")
fi
echo "$LOGIN_BODY" | grep -q "$DEMO_EMAIL"

echo "== create quote =="
Q=$(curl -sS -c "$COOKIE" -b "$COOKIE" -X POST "$BASE/api/quotes" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Smoke job","jobType":"general","lineItems":[{"type":"labor","description":"Labor","hours":1,"rate":75}]}')
QID=$(echo "$Q" | json_field quote.id)
echo "  id=$QID"

echo "== send =="
SEND=$(curl -sS -c "$COOKIE" -b "$COOKIE" -X POST "$BASE/api/quotes/$QID/send")
TOKEN=$(echo "$SEND" | json_field quote.publicToken)

echo "== view =="
curl -sS "$BASE/api/public/estimate/$TOKEN" | grep -q title

echo "== re-send after view =="
curl -sS -c "$COOKIE" -b "$COOKIE" -X POST "$BASE/api/quotes/$QID/send" | grep -q shareUrl

echo "== accept =="
SIG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
curl -sS -X POST "$BASE/api/public/estimate/$TOKEN/accept" \
  -H 'Content-Type: application/json' \
  -d "{\"signedName\":\"Smoke Tester\",\"signatureData\":\"$SIG\"}" \
  | grep -q accepted

echo "== convert =="
CONV=$(curl -sS -c "$COOKIE" -b "$COOKIE" -X POST "$BASE/api/quotes/$QID/convert")
INVID=$(echo "$CONV" | json_field invoice.id)

echo "== manual payment record =="
curl -sS -c "$COOKIE" -b "$COOKIE" -X POST "$BASE/api/payments/record" \
  -H 'Content-Type: application/json' \
  -d "{\"invoiceId\":\"$INVID\",\"amountCents\":1000,\"method\":\"cash\",\"idempotencyKey\":\"smoke_${INVID}_cash\"}" \
  | grep -q succeeded

echo "== card charge disabled =="
code=$(curl -sS -o /tmp/charge.json -w "%{http_code}" -c "$COOKIE" -b "$COOKIE" -X POST "$BASE/api/payments/charge" \
  -H 'Content-Type: application/json' \
  -d "{\"invoiceId\":\"$INVID\",\"idempotencyKey\":\"x\"}")
test "$code" = "501"

echo "== team list =="
curl -sS -c "$COOKIE" -b "$COOKIE" "$BASE/api/team" | grep -q users

echo "== activities =="
curl -sS -c "$COOKIE" -b "$COOKIE" "$BASE/api/quotes/$QID/activities" | grep -q activities

echo "== pages =="
for p in /dashboard /settings /catalog /customers /invoices /quotes/new /pricing; do
  code=$(curl -sS -o /dev/null -w "%{http_code}" -b "$COOKIE" "$BASE$p")
  echo "  $p $code"
  test "$code" = "200" -o "$code" = "307"
done

echo "SMOKE_OK"
