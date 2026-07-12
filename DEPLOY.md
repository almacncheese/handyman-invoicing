# Deploy — quickhandyquote.com

**Domain (owned):** `quickhandyquote.com` — Hostinger registrar  
**Hosting target:** Coolify on Hostinger VPS (`72.62.169.186` pattern)  
**Repo:** `almacncheese/handyman-invoicing` (private)  
**Status:** **LIVE** (2026-07-11) — Coolify app `handyquote` + nginx + Let’s Encrypt

## Canonical URLs

| Env | `APP_URL` |
|-----|-----------|
| Local | `http://localhost:3000` |
| Production | `https://quickhandyquote.com` |

Also serve **`www.quickhandyquote.com` → apex** (301) so estimate links stay consistent.  
Public estimate links and share deep-links use `APP_URL` (`src/lib/config.ts` → `appUrl()`). **Wrong `APP_URL` in Coolify = broken share/sign links.**

## DNS (Hostinger)

Point the domain at the VPS / Coolify proxy (not “Hostinger Website Builder” hosting unless Al chooses that):

1. Hostinger → **Domains** → `quickhandyquote.com` → **DNS / Nameservers**
2. Prefer: keep nameservers at Hostinger **or** Cloudflare (if you put CF in front later)
3. Records (typical Coolify + reverse proxy):

| Type | Name | Value | Notes |
|------|------|--------|------|
| **A** | `@` | VPS public IP | Apex → Coolify/Traefik |
| **CNAME** | `www` | `quickhandyquote.com` | Or A → same IP |
| **A/AAAA** | (none extra) | — | Don’t leave parking/default Hostinger site on `@` |

4. After Coolify issues certs: confirm HTTPS on apex + www redirect.
5. **Do not** publish the app container port on eth0; only the proxy (80/443). Portfolio lesson: published app ports bypass Cloudflare/nginx limits.

## Live topology (2026-07-11)

| Piece | Detail |
|-------|--------|
| Coolify app | name `handyquote`, uuid `hq4432089401570550b16a6d` |
| Container port map | host **3004** → container 3000 |
| Postgres | Docker `handyquote-db` on `coolify` network (not Coolify UI DB) |
| Edge | **nginx** `/etc/nginx/sites-enabled/quickhandyquote` → `127.0.0.1:3004` |
| TLS | Let’s Encrypt `quickhandyquote.com` (+ www), certbot auto-renew |
| Health | `https://quickhandyquote.com/api/health` |
| Start | `scripts/docker-start.sh` → `prisma migrate deploy` then `next start` |

**Redeploy:** push `main` (auto-deploy on) or Coolify force rebuild / tinker `queue_application_deployment`.

### Coolify env (runtime-only — do **not** mark secrets as build-time)

| Var | Prod value |
|-----|------------|
| `NODE_ENV` | `production` (runtime only) |
| `APP_URL` | `https://quickhandyquote.com` |
| `AUTH_SECRET` | long random (fail-closed if missing) |
| `DATABASE_URL` | `postgresql://handyquote:***@handyquote-db:5432/handyquote?schema=public` |
| `PAYMENTS_MODE` | `mock` |
| `ALLOW_MOCK_PAYMENTS` | `true` until card pay is green-lit |

Secrets live in Coolify’s encrypted env store. Emergency copies: root-only files on VPS `/root/.handyquote-*.secret` (not in git).

### Build gotchas already fixed

- `NODE_ENV=production` as **build-time** env → `npm ci` skips devDeps → missing `@tailwindcss/postcss`. Keep build-time flags off for NODE_ENV/secrets; Dockerfile forces `npm ci --include=dev`.
- Turbopack Docker prerender of `/_global-error` failed with custom layout head/script → use `next build --webpack` + minimal root layout.

## Pre-flight (before first go-live)

- [ ] `npm test` + `npm run build` green locally  
- [ ] No secrets in git (`git status` clean of `.env`)  
- [ ] Real `AUTH_SECRET` + `DATABASE_URL` in Coolify only  
- [ ] `APP_URL=https://quickhandyquote.com`  
- [ ] DNS A/`www` pointed; TLS green  
- [ ] Login + send estimate + open public link on a **phone** (not just laptop)  
- [ ] Card charges still 501 / manual record only — intentional  

## Database backups (required for real tenants)

A single Docker volume is **not** a backup. Install a daily dump on the VPS:

```bash
# On VPS — once
sudo mkdir -p /var/backups/handyquote
sudo tee /opt/handyquote-backup.sh >/dev/null <<'SH'
#!/usr/bin/env bash
export BACKUP_DIR=/var/backups/handyquote
export RETAIN_DAYS=14
# Optional off-box: export RCLONE_REMOTE=b2:handyquote-backups
bash /path/to/repo/scripts/backup-postgres.sh
SH
# Or copy scripts/backup-postgres.sh to /opt/ and chmod +x

# Cron 03:00 UTC daily
echo '0 3 * * * root /opt/handyquote-backup.sh >> /var/log/handyquote-backup.log 2>&1' | sudo tee /etc/cron.d/handyquote-backup
```

Confirm a `.sql.gz` appears under `/var/backups/handyquote` after the first run. Prefer also copying off-box (`RCLONE_REMOTE`).

## Post-deploy verify

```bash
curl -sS https://quickhandyquote.com/api/health
# Expect JSON ok — check at origin if CF caches later
```

Then: sign in → create estimate → copy public link → open on phone → e-sign path.

## Out of scope until asked

- Live AuthNet/Stripe charges  
- Resend production email domain (`mail.quickhandyquote.com` / SPF/DKIM)  
- SaaS billing for HandyQuote Pro  

## Email later (when Resend lands)

- Sending domain: `quickhandyquote.com` (or `mail.quickhandyquote.com`)  
- SPF/DKIM/DMARC at Hostinger DNS  
- From: something like `estimates@quickhandyquote.com`
