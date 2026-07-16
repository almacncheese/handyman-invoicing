# HandyQuote secrets inventory (names only — never values)

**Goal:** survive machine reboots, new shells, and agent sessions without secrets living only in chat history.

## Sources of truth

| Layer | Role |
|-------|------|
| **macOS Keychain** (this Mac) | Offline backup + agent-readable vault |
| **Coolify env** (handyquote app) | What production actually runs |
| **VPS root files** | Emergency recovery only |

Do **not** commit `.env`, Keychain exports, or secret values to git.

## Keychain entries (account = macOS username)

| Service name (`-s`) | Maps to env | Notes |
|---------------------|-------------|--------|
| `resend_api_key` | `RESEND_API_KEY` | Resend dashboard |
| `hostinger_api_key` | Hostinger API | DNS automation |
| `handyquote_auth_secret` | `AUTH_SECRET` | Session signing (prod) |
| `handyquote_database_password` | part of `DATABASE_URL` | Postgres for `handyquote-db` |
| `handyquote_platform_admin_password` | login password | Platform admin user password |
| `handyquote_r2_access_key_id` | `R2_ACCESS_KEY_ID` | When R2 is set up |
| `handyquote_r2_secret_access_key` | `R2_SECRET_ACCESS_KEY` | When R2 is set up |
| `handyquote_r2_account_id` | `R2_ACCOUNT_ID` | When R2 is set up |
| `handyquote_r2_bucket` | `R2_BUCKET_NAME` | When R2 is set up |
| `handyquote_r2_public_url` | `R2_PUBLIC_URL` | When R2 is set up |

Read example (never log the output in chat/docs):

```bash
security find-generic-password -a "$USER" -s "resend_api_key" -w
```

Write / update:

```bash
security add-generic-password -a "$USER" -s "handyquote_auth_secret" -w "THE_VALUE" -U
```

## Coolify env vars (production)

Runtime-only preferred for secrets (not build-time).

| Name | Required |
|------|----------|
| `APP_URL` | yes → `https://quickhandyquote.com` |
| `AUTH_SECRET` | yes |
| `DATABASE_URL` | yes |
| `NODE_ENV` | `production` |
| `PAYMENTS_MODE` | `mock` until cards |
| `ALLOW_MOCK_PAYMENTS` | `true` while mock |
| `RESEND_API_KEY` | for email |
| `RESEND_FROM_EMAIL` | for email |
| `R2_ACCOUNT_ID` | photos (LIVE 2026-07-15) |
| `R2_ACCESS_KEY_ID` | photos |
| `R2_SECRET_ACCESS_KEY` | photos |
| `R2_BUCKET_NAME` | `handyquote-photos` |
| `R2_PUBLIC_URL` | r2.dev public base |
| `ENCRYPTION_KEY` | per-tenant payment gateway crypto |

## Off-box backups

| Piece | Value |
|-------|--------|
| Local | `/var/backups/handyquote/` via `/opt/handyquote-backup.sh` |
| Cron | `/etc/cron.d/handyquote-backup` 03:15 UTC |
| R2 bucket | `handyquote-backups` |
| Remote | `RCLONE_REMOTE=r2:handyquote-backups` (VPS rclone `r2:` remote) |

## VPS emergency files (root only)

| Path | Contents |
|------|----------|
| `/root/.handyquote-auth.secret` | AUTH_SECRET |
| `/root/.handyquote-db.pass` | Postgres password for handyquote-db |

## Platform admin (app login, not a Keychain API key)

| Field | Value |
|-------|--------|
| Email | `owner@smithwebco.com` |
| Password | stored as Keychain `handyquote_platform_admin_password` |
| UI | `/admin` |

Rotate password in **Settings → Security** after first login; then update Keychain with the same script.

## Restore after machine wipe

1. From Coolify UI or VPS, re-copy secrets into Keychain via `scripts/secrets-pull-from-prod.sh`
2. Or restore from 1Password once Al migrates the vault there
3. Redeploy Coolify with env from Keychain via `scripts/secrets-push-to-coolify.sh` (when needed)

## Script

```bash
# Pull prod secrets → Keychain (no values printed)
bash scripts/secrets-pull-from-prod.sh

# Write local gitignored .env from Keychain for npm run dev
bash scripts/secrets-write-local-env.sh
```
