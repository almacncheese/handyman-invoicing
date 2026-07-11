#!/usr/bin/env bash
# Production smoke against quickhandyquote.com
set -euo pipefail
BASE="${1:-https://quickhandyquote.com}"
export DEMO_EMAIL="${DEMO_EMAIL:-demo@quickhandyquote.com}"
exec bash "$(dirname "$0")/smoke.sh" "$BASE"
