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
BACKUP_DIR="${BACKUP_DIR:-/var/backups/handyquote}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
# Coolify often prefixes names; allow override
DB_CONTAINER="${HANDYQUOTE_DB_CONTAINER:-}"
DB_USER="${HANDYQUOTE_DB_USER:-handyquote}"
DB_NAME="${HANDYQUOTE_DB_NAME:-handyquote}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/handyquote-${STAMP}.sql.gz"

resolve_db_container() {
  if [[ -n "$DB_CONTAINER" ]]; then
    echo "$DB_CONTAINER"
    return
  fi
  # Exact name first, then any running container with handyquote + postgres/db in name
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'handyquote-db'; then
    echo 'handyquote-db'
    return
  fi
  local hit
  hit="$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E 'handyquote.*(db|postgres)|postgres.*handyquote' | head -1 || true)"
  if [[ -n "$hit" ]]; then
    echo "$hit"
    return
  fi
  return 1
}

if CONTAINER="$(resolve_db_container)"; then
  echo "Dumping via docker exec $CONTAINER ($DB_USER/$DB_NAME)"
  docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip -c > "$OUT"
elif [[ -n "$URL" ]] && command -v pg_dump >/dev/null 2>&1; then
  echo "Dumping via pg_dump URL"
  pg_dump "$URL" | gzip -c > "$OUT"
else
  echo "No handyquote DB container found and no DATABASE_URL/pg_dump available" >&2
  echo "Set HANDYQUOTE_DB_CONTAINER or DATABASE_URL" >&2
  docker ps --format '  {{.Names}}\t{{.Image}}' 2>/dev/null || true
  exit 1
fi

# Drop local copies older than RETAIN_DAYS
find "$BACKUP_DIR" -name 'handyquote-*.sql.gz' -type f -mtime "+${RETAIN_DAYS}" -delete 2>/dev/null || true

# Optional: copy off-box if RCLONE_REMOTE is set (e.g. r2:handyquote-backups).
# R2 via rclone often returns a one-shot 501 then succeeds — allow retries.
if [[ -n "${RCLONE_REMOTE:-}" ]] && command -v rclone >/dev/null 2>&1; then
  rclone copy "$OUT" "$RCLONE_REMOTE/" --retries 5 --low-level-retries 10
  echo "Uploaded to $RCLONE_REMOTE"
fi

ls -lh "$OUT"
echo "OK $OUT"
