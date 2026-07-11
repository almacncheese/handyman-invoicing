# AGENT_NOTES.md — handyman-invoicing (HandyQuote)

> Read before changes. Update before finishing. Sister log: `AGENT_LOG.md`.

## What this is

**HandyQuote** — multi-tenant SaaS for handymen/contractors: quote builder (material+margin, labor, flat), public e-sign link, invoice conversion, Authorize.net/mock deposits.

Repo: `almacncheese/handyman-invoicing`  
Local path: `~/dev/handyman-invoicing`  
**Production domain:** `https://quickhandyquote.com` — **LIVE** on Hostinger VPS (Coolify app `handyquote` → nginx :3004 → LE cert)  
Full runbook: `DEPLOY.md`

Sister product (single-tenant PHP proof): `~/dev/aim-estimator` (AIM Fencing & Roofing). Do not break AIM deploy; this is a different product.

## Stack

- Next.js App Router + TypeScript + Tailwind v4
- Prisma + PostgreSQL
- jose httpOnly session cookies (`hq_session`)
- Vitest for pure lib tests
- Payments: `PaymentProvider` interface → mock (local) or Authorize.net

## How to run locally

```bash
cp .env.example .env
# Postgres: either `docker compose up -d postgres` OR any local Postgres on :5432
# (2026-07-10: host already had :5432 allocated — Prisma used that DB successfully)
npm install
npx prisma migrate dev
npm run db:seed
npm run dev
```

Demo login (after seed): `demo@handyquote.local` / `demo-demo-demo`

Verified 2026-07-10: `npm test` 24/24 · `npm run build` green · API smoke login→send→accept→invoice→mock deposit (+ idempotent replay).

## Things that broke before — DON'T repeat

| Mistake | Result | Fix |
|---|---|---|
| [money] Float dollars in core math | Rounding drift | Integer **cents** in `src/lib/calculations.ts` |
| [auth] Default secret in prod | Forgeable sessions | `getAuthSecret()` fail-closed when `NODE_ENV=production` |
| [authz] Middleware-only cookie check | IDOR | Handler `requireSession` + `assertSameBusiness` → 404 cross-tenant |
| [payment] Charge without claim | Double charge | `/api/payments/charge` conditional `pending→processing` before provider |
| [public] Unguarded token | Enumeration | `isValidPublicToken` before DB |
| [sign] Overwrite on race | Clobber signature | `updateMany` where signature still null |
| [docker] `npm ci --only=production` then build | Missing devDeps | Multi-stage Dockerfile |
| [deps] Old Next 15.3.3 | CVE warning | Pin patched Next (see package.json) |

## Brand assets

- **Primary UI mark:** `/public/brand/logo-mark.svg` (vector — use in app chrome)
- **Wordmark lockup:** `/public/brand/logo.svg`
- **Rich app icon / Apple touch:** `/public/brand/logo-mark-rich.jpg`
- **Component:** `src/components/BrandLogo.tsx` — wire marketing + app shell here, don’t invent new CSS marks
- Favicon: `src/app/icon.svg` + metadata icons in `layout.tsx`
- Tenant **business logo** is separate (`Business.logoUrl` on public estimates) — product brand ≠ contractor brand

## Conventions

- Totals **server-authoritative** on every quote save
- Status machine: `src/lib/quote-status.ts` (forward-only)
- Product docs: `PRODUCT_CONTRACT.md`, `ACCEPTANCE.md`, `DECISIONS.md`, `TEST_PLAN.md`

## Before you deploy

1. Al's explicit go-ahead
2. `npm test` + `npm run build`
3. Real `AUTH_SECRET` + DB URL in Coolify
4. **`APP_URL=https://quickhandyquote.com`** (share/sign links break if wrong)
5. DNS A + www for `quickhandyquote.com` → VPS/Coolify (see `DEPLOY.md`)
6. Card payments intentionally disabled until Al green-lights processor work

## Active known issues

- **Card payments disabled** (`/api/payments/charge` + public pay → 501). Manual cash/Zelle record only.
- Photo storage is data-URL JSON (fine locally; move to R2/S3 at scale)
- SaaS billing for HandyQuote Pro not wired (pricing is marketing)
- Email/SMS is device deep links only (no Resend)
- Rate limits are in-process (per container); fine for single Coolify replica

## Demo (prod)

- Owner: `demo@quickhandyquote.com` / `demo-demo-demo`
- Smoke: `bash scripts/live-smoke.sh`
- Seed (prod container, non-wipe if demo exists): `npx prisma db seed`
