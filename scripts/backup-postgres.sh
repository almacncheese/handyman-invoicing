#!/usr/bin/env bash
# HandyQuote Postgres backup — run on the VPS (cron) or from a machine with
# DB network access. Off-box copy is required; a single Docker volume is not a backup.
#
# Coolify/prod example (on VPS as root):
#   0 3 * * * /opt/handyquote-backup.sh >> /var/log/handyquote-backup.log 2>&1
#
# Env:
#   DATABASE_URL   postgres URL (or pass as $1)
#   BACKUP_DIR     default /var/backups/handyquote
#   RETAIN_DAYS    default 14
set -euo pipefail

URL="${1:-${DATABASE_URL:-}}"
if [[ -z "$URL" ]]; then
  echo "Usage: DATABASE_URL=postgres://... $0   OR   $0 <database-url>" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-/var/backups/handyquote}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/handyquote-${STAMP}.sql.gz"

# Prefer docker exec against handyquote-db when available (prod Coolify layout)
if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'handyquote-db'; then
  docker exec handyquote-db pg_dump -U handyquote handyquote | gzip -c > "$OUT"
else
  if ! command -v pg_dump >/dev/null 2>&1; then
    echo "pg_dump not found and handyquote-db container not running" >&2
    exit 1
  fi
  pg_dump "$URL" | gzip -c > "$OUT"
fi

# Drop local copies older than RETAIN_DAYS
find "$BACKUP_DIR" -name 'handyquote-*.sql.gz' -type f -mtime "+${RETAIN_DAYS}" -delete 2>/dev/null || true

# Optional: copy off-box if RCLONE_REMOTE is set (e.g. b2:handyquote-backups)
if [[ -n "${RCLONE_REMOTE:-}" ]] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$OUT" "$RCLONE_REMOTE/"
  echo "Uploaded to $RCLONE_REMOTE"
fi

ls -lh "$OUT"
echo "OK $OUT"
