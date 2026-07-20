#!/bin/bash
# Ledgerly preview bootstrap — makes PostgreSQL self-heal across pod resumes.
# System packages (/usr) and default PGDATA (/var) do NOT persist in this env,
# but /app does. So we reinstall binaries if missing and keep PGDATA inside /app.
set -uo pipefail

export PGDATA=/app/.local/pgdata
LOG=/tmp/dbboot.log
echo "[dbboot] $(date)" >> "$LOG"

# 1) Ensure binaries (reinstall after a pod reset wiped /usr)
if ! ls /usr/lib/postgresql/*/bin/pg_ctl >/dev/null 2>&1 || ! command -v socat >/dev/null 2>&1; then
  echo "[dbboot] installing postgresql + socat" >> "$LOG"
  apt-get update >> "$LOG" 2>&1
  apt-get install -y postgresql postgresql-contrib socat >> "$LOG" 2>&1
fi
PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
echo "[dbboot] PGBIN=$PGBIN" >> "$LOG"

# 2) Initialize persistent data dir if empty
mkdir -p /app/.local
chown postgres:postgres /app/.local 2>/dev/null || true
if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "[dbboot] initdb" >> "$LOG"
  rm -rf "$PGDATA"; mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  su postgres -c "$PGBIN/initdb -D $PGDATA -A trust -E UTF8" >> "$LOG" 2>&1
fi
chown -R postgres:postgres "$PGDATA" 2>/dev/null || true

# 3) Start server (foreground-safe: pg_ctl start backgrounds the postmaster)
su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-c listen_addresses=127.0.0.1 -p 5432' -w -t 30 start" >> "$LOG" 2>&1 || true

# 4) Ensure role + database
su postgres -c "$PGBIN/psql -p 5432 -d postgres -c \"ALTER USER postgres PASSWORD 'postgres';\"" >> "$LOG" 2>&1 || true
if ! su postgres -c "$PGBIN/psql -p 5432 -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='handyman_invoicing'\"" 2>/dev/null | grep -q 1; then
  su postgres -c "$PGBIN/createdb -p 5432 handyman_invoicing" >> "$LOG" 2>&1 || true
fi

# 5) Sync schema, seed once
cd /app
npx prisma db push --skip-generate >> "$LOG" 2>&1 || true
CNT=$(su postgres -c "$PGBIN/psql -p 5432 -d handyman_invoicing -tAc 'SELECT count(*) FROM \"User\"'" 2>/dev/null | tr -d '[:space:]')
if [ -z "$CNT" ] || [ "$CNT" = "0" ]; then
  echo "[dbboot] seeding demo data" >> "$LOG"
  npm run db:seed >> "$LOG" 2>&1 || true
fi
echo "[dbboot] done" >> "$LOG"
