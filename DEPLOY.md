# Deploy notes (Hostinger VPS / Coolify) — later

Local perfection first. When Al picks a domain:

## Coolify

1. New resource → Dockerfile from this repo.
2. Set env from `.env.example` (**real** `AUTH_SECRET`, Postgres URL, AuthNet keys or `PAYMENTS_MODE=mock` only if intentional).
3. Health check path: `/api/health`
4. Run migrations on release: `npx prisma migrate deploy`
5. Do **not** publish app ports on eth0; put Cloudflare/proxy in front (fflcommand lesson).

## Pre-flight

- `npm test` + `npm run build` green locally
- No secrets in git
- Prod `AUTH_SECRET` set (fail-closed — no default)
- Payments: never charge without idempotency (already in `/api/payments/charge`)

## Domain

Decide later with Al (e.g. handyquote.app / gethandyquote.com). Not blocking local build.
