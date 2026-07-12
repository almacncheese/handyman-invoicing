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

Demo login (after seed): `demo@quickhandyquote.com` / `demo-demo-demo`  
Platform admin: `owner@smithwebco.com` (password in Keychain `handyquote_platform_admin_password`) → `/admin`

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
| [docker] Coolify injects NODE_ENV=production as build ARG | `npm ci` skips devDeps → next build dies | Dockerfile force `npm ci --include=dev`; secrets **runtime-only** in Coolify |
| [docker] Turbopack + custom root layout head/script | `/_global-error` prerender useContext null | `next build --webpack` + minimal root layout |
| [ux] Capability exists but no signed-in path (e.g. password) | User thinks feature missing | Account menu + Settings → Security; don't rely on forgot-password alone |
| [schema] Init migration lagged product schema | Prod missing columns (User.active) | Keep migrations in sync; `db push` only emergency; follow-up migrate |
| [lifecycle] Race-safe accept only; decline was plain update | Concurrent decline clobbered signature | `declineWriteGuard` + `updateMany`; same pattern as accept |
| [lifecycle] Convert healed status from `acceptedAt` | Voided quotes resurrected into invoices | `canConvertToInvoice(status)` only — never acceptedAt bypass |
| [data-loss] Seed wipe = global `deleteMany` on NODE_ENV | One env mistake deletes all tenants | Demo-scoped wipe; full wipe needs SEED_WIPE_ALL+CONFIRM; refused in prod |
| [audit] Shipped live then audited | Criticals found after real signups possible | `~/dev/_PRE-LIVE-GATE.md` + `/pre-live-gate` *before* real tenants |

## Brand assets

- **Primary UI mark:** `/public/brand/logo-mark.svg` (vector — use in app chrome)
- **Wordmark lockup:** `/public/brand/logo.svg`
- **Rich app icon / Apple touch:** `/public/brand/logo-mark-rich.jpg`
- **Component:** `src/components/BrandLogo.tsx` — wire marketing + app shell here, don’t invent new CSS marks
- Favicon: `src/app/icon.svg` + metadata icons in `layout.tsx`
- Tenant **business logo** is separate (`Business.logoUrl` on public estimates) — product brand ≠ contractor brand

## Conventions

- Totals **server-authoritative** on every quote save
- Status machine: `src/lib/quote-status.ts` (forward-only) — **every** status writer must use it (`canTransition` / `canConvertToInvoice` / `declineWriteGuard`); no one-off heuristics
- Product docs: `PRODUCT_CONTRACT.md`, `ACCEPTANCE.md`, `DECISIONS.md`, `TEST_PLAN.md`
- Pre-live / audit punch list: `docs/PRE-LIVE-PUNCHLIST.md` · portfolio gate: `~/dev/_PRE-LIVE-GATE.md`

## Secrets (don't lose them)

- **Inventory (names only):** `scripts/secrets-inventory.md`
- **Machine vault:** macOS Keychain (`resend_api_key`, `handyquote_auth_secret`, `handyquote_database_password`, `handyquote_platform_admin_password`, …)
- **Prod source of truth:** Coolify env on app `handyquote`
- **Pull prod → Keychain:** `bash scripts/secrets-pull-from-prod.sh`
- **Local `.env` from Keychain:** `bash scripts/secrets-write-local-env.sh` (gitignored, mode 600)
- **Set one Keychain value:** `bash scripts/secrets-set-keychain.sh <service> '<value>'`
- Never put secret **values** in AGENT_NOTES / commits / chat

## Before you deploy

1. Al's explicit go-ahead
2. `npm test` + `npm run build`
3. Real `AUTH_SECRET` + DB URL in Coolify
4. **`APP_URL=https://quickhandyquote.com`** (share/sign links break if wrong)
5. DNS A + www for `quickhandyquote.com` → VPS/Coolify (see `DEPLOY.md`)
6. Card payments intentionally disabled until Al green-lights processor work
7. Secrets runtime-only in Coolify (not build-time)

## Before real tenants / money / e-sign risk (pre-live gate)

1. Run **`/pre-live-gate`** — checklist: `~/dev/_PRE-LIVE-GATE.md`
2. Adversarial pass by a **different** agent than the builder (Claude / `adversarial-qa`)
3. Sibling-writer sweep on quote status, signatures, payments
4. Confirm seed cannot global-wipe prod (`prisma/seed.ts` demo-scoped only)
5. Backups: still **open** — schedule off-box `pg_dump` before more paying tenants
6. Punch list status: `docs/PRE-LIVE-PUNCHLIST.md`

## Active known issues

- **Card deposits + Pro checkout still deferred** (charge routes 501; trial/plan enforcement live)
- **Resend from-domain:** still onboarding@resend.dev until `quickhandyquote.com` verified in Resend (SPF/DKIM)
- Photos: R2 optional — needs Coolify `R2_*` env (code ready; see Photo object storage section)
- Rate limits are in-process (per container); fine for single Coolify replica
- **No automated DB backups yet** (single VPS volume) — pre-live residual risk
- Audit highs still open: payment-record idempotency/atomic balance, XFF rate limits, route CI, pagination (see punch list)

## Demo (prod)

- Owner: `demo@quickhandyquote.com` / `demo-demo-demo`
- Smoke: `bash scripts/live-smoke.sh`
- Seed (prod container, non-wipe if demo exists): `npx prisma db seed`

## Platform admin

- UI: `/admin` (requires `User.platformAdmin`)
- Ensure admin: `npx tsx scripts/ensure-platform-admin.ts`
- Env overrides: `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD` (never commit real secrets)
- Capabilities: list all workspaces/users, add user, set Pro/trial, override monthly price cents

## Email (Resend)

- Env: `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (e.g. `HandyQuote <estimates@quickhandyquote.com>`)
- Domain DNS: verify `quickhandyquote.com` in Resend (SPF/DKIM)
- Sends: estimate to customer, staff invite, password reset, signed notify to business
- Without key: actions still work (link copy); email returns `sent: false`

## Photo object storage (R2)

1. Cloudflare dashboard → R2 → Create bucket e.g. `handyquote-photos`
2. Enable public access (custom domain or R2.dev public URL)
3. Manage R2 API Tokens → create S3-compatible token with Object Read & Write
4. Coolify env on handyquote app:
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME`
   - `R2_PUBLIC_URL` (no trailing slash)
5. Redeploy. `GET /api/uploads/photo` returns `{ configured: true, storage: "r2" }`
6. Without env: photos still save as inline data URLs (works, DB-heavy)

## Reports

- UI: `/reports` (nav + Account menu)
- API: `GET /api/reports/summary`
