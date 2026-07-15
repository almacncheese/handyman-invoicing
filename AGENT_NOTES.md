# AGENT_NOTES.md — handyman-invoicing (HandyQuote)

> Read before changes. Update before finishing. Sister log: `AGENT_LOG.md`.

## What this is

**HandyQuote** — multi-tenant SaaS for handymen/contractors: quote builder (material+margin, labor, flat), public e-sign link, invoice conversion, per-tenant card deposits (Authorize.net/Stripe/Square/PayPal — each contractor brings their own merchant account).

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
- Payments: `PaymentProvider` interface → per-tenant Authorize.net/Square (one-shot) or Stripe/PayPal (two/three-phase) — see "Per-tenant payment gateways" below

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
| [payment] Built single-tenant Authorize.net credentials from platform env vars without confirming who owns the merchant account | Whole feature unusable — Al has no AuthNet account, every tenant would've shared one nonexistent account | Confirm the actual money-flow ownership model (who's the merchant of record?) before building ANY payment integration, not just before choosing a processor |

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
6. Per-tenant card charging is built (2026-07-14) — **`ENCRYPTION_KEY` must be set in Coolify** (required, no dev fallback — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`) or every contractor's Settings → Payment processor save will 500. Each contractor then configures their OWN Authorize.net/Stripe/Square/PayPal credentials via Settings — no other env vars needed for this feature.
7. Secrets runtime-only in Coolify (not build-time)

## Before real tenants / money / e-sign risk (pre-live gate)

1. Run **`/pre-live-gate`** — checklist: `~/dev/_PRE-LIVE-GATE.md`
2. Adversarial pass by a **different** agent than the builder (Claude / `adversarial-qa`)
3. Sibling-writer sweep on quote status, signatures, payments
4. Confirm seed cannot global-wipe prod (`prisma/seed.ts` demo-scoped only)
5. Backups: still **open** — schedule off-box `pg_dump` before more paying tenants
6. Punch list status: `docs/PRE-LIVE-PUNCHLIST.md`

## Active known issues

- **Per-tenant card charging (4 processors, contractor phone-entry + public customer self-serve) built 2026-07-14; audit harden 2026-07-15** (`docs/AUDIT-2026-07-15.md`) — still awaiting `ENCRYPTION_KEY` in Coolify + real contractor credentials. Settings UI: all four processors self-serve (owner). Nothing charges a real card until a contractor configures their own processor via Settings.
- **Pro subscription checkout (HandyQuote → contractor) built 2026-07-13, awaiting real Stripe keys** — see "Stripe subscription billing" section below. Code path is live and tested; nothing charges real money until `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_ID` are set.
- **Resend from-domain:** still onboarding@resend.dev until `quickhandyquote.com` verified in Resend (SPF/DKIM)
- Photos: R2 optional — needs Coolify `R2_*` env (code ready; see Photo object storage section)
- Rate limits are in-process (per container); fine for single Coolify replica. `clientIp()` no longer trusts `cf-connecting-ip` (fixed 2026-07-13 — this deployment has no Cloudflare in front, so that header was attacker-controlled, not proxy-verified; don't re-add that trust without an actual CF proxy in front, verified against the real nginx config).
- **Backup cron LIVE on VPS** (2026-07-12): `/opt/handyquote-backup.sh` + `/etc/cron.d/handyquote-backup` (03:15 UTC daily); dumps in `/var/backups/handyquote/` (14d retain). First dump verified. Off-box (`RCLONE_REMOTE`) still optional.
- Route-level e2e still thin (lib tests + CI green) — exceptions: the Stripe billing webhook route and the entire payment-gateway stack (crypto, gateway-config, all 4 provider modules, card-charge's shared claim/settle primitives, all 6 charge/intent/confirm routes across both contexts, the settings route) have dedicated TDD coverage — ~115 tests just for payments.

## Per-tenant payment gateways (Authorize.net / Stripe / Square / PayPal)

**Separate concern from Stripe subscription billing above — do not conflate.** This is a *contractor* charging *their own customer's* card into *their own* merchant account (deposits/balances); Stripe billing above is HandyQuote charging the contractor's own $29/mo subscription into Al's account. Paste-your-own-API-keys model throughout — deliberately NOT OAuth Connect/Partner flows (those need applying to become an approved platform with each provider, external review, out of scope).

- **Schema**: `PaymentGatewayConfig` (one row per `Business`, `businessId @unique` — a tenant configures exactly ONE active provider at a time, switch by re-saving). `publicFields` (Json, e.g. `{apiLoginId,clientKey}` for AuthNet) is safe to read back to the settings UI and the public estimate page. `secretEnc` is an AES-256-GCM-encrypted JSON blob of the provider's actual secret (e.g. `{transactionKey}`) — see `src/lib/crypto.ts`. `Payment.providerRef` stores the Stripe PaymentIntent id / PayPal order id for the async providers, server-set only, never client-supplied.
- **`src/lib/gateway-config.ts`** is the only place that decrypts: `loadGatewayConfig(businessId)` (charge-time, **throws** on any corruption — tampered ciphertext, wrong `ENCRYPTION_KEY`, malformed fields — a real money operation should fail loudly, never proceed on garbage) vs. `publicGatewayConfig(row)` (display-time, never touches `secretEnc` at all, fails closed to `null` on a corrupt/unknown provider so a bad row can't break a page render).
- **One-shot providers (Authorize.net, Square)**: client tokenizes (Accept.js / Square Web Payments SDK), single POST to `/api/payments/charge` or `/api/public/estimate/[token]/pay`, single server-side charge call via `src/lib/providers/factory.ts`'s `createOneShotProvider(config)`. `src/lib/card-charge.ts`'s `processCardCharge()` is the shared orchestration — unchanged in spirit from the original AuthNet-only version, now provider-agnostic.
- **Two/three-phase providers (Stripe non-Connect, PayPal non-Partner)**: their confirm step is inherently client-driven (Stripe Elements/PayPal's popup never hand raw card data or approval proof to our server), so they can't fit the one-shot `PaymentProvider.charge()` interface. New routes `POST /api/payments/intent` + `POST /api/payments/confirm` (and public mirrors under `pay/intent` + `pay/confirm`) — intent creates+claims, confirm independently verifies with the provider (`stripe.paymentIntents.retrieve()` / PayPal capture) before crediting anything, **never trusting the client's mere claim of success**. `src/lib/providers/stripe-charge.ts` / `paypal-charge.ts` hold this logic.
- **Shared claim/settle core, extracted for all 4 providers**: `claimStatusTransition()` (generalizes the original create+P2002-catch+conditional-reclaim so it serves both one-shot `pending/failed→processing` and async `pending/failed→awaiting_confirmation`) and `settleCharge()` (the credit-invoice-and-mark-succeeded tail), both in `card-charge.ts`.
- **A stuck `processing` row is a safe failure mode, not a bug to "fix" with a timeout-based auto-reclaim** — unchanged from the original design; still true for all 4 providers. **New for Stripe/PayPal**: `cancelStripeIntent`/`cancelPaypalOrder` handle the *common, benign* case of a customer backing out of a 3DS challenge or closing the PayPal popup — flips `awaiting_confirmation→failed` (only from exactly that state) so the same idempotencyKey can retry, distinct from the rare crash-mid-flight case that still needs manual DB reconciliation.
- **Cross-tenant / stale-reference protection**: the confirm/capture step never accepts a client-supplied Stripe intent id or PayPal order id — only our own server-generated `paymentId` (Payment row's own cuid), re-verified against the caller's own business/invoice scoping before the row's stored `providerRef` is ever read.
- The client's own `.env`/Coolify story is now much simpler: **only `ENCRYPTION_KEY`** (platform-wide, generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`, required no dev fallback, at least as sensitive as the Stripe billing keys). No more global `AUTHORIZE_NET_*` vars anywhere — each contractor's own credentials live encrypted in the DB, entered via Settings → Payment processor (`src/components/PaymentGatewaySettings.tsx`, `PUT /api/business/payment-gateway`, owner-only; secret fields always render blank, a blank secret on save means "keep the existing one," only honored when the provider is unchanged).
- **Client components**: `CardChargeForm.tsx` (AuthNet, unchanged), `SquareCardForm.tsx`, `StripeCardForm.tsx` (needs `@stripe/stripe-js`, added this session), `PaypalButtonForm.tsx` (button/popup, no card-entry form at all — Advanced Card Processing needs partner approval, ruled out). `PaymentCardForm.tsx` is the switcher both `QuoteActions.tsx` and `PublicEstimate.tsx` use — neither has any provider-specific branching beyond passing it a `gatewayConfig`.
- **HTTPS is required for real client-side tokenization** (Accept.js, Stripe Elements, and Square's Web Payments SDK all refuse to run over plain HTTP) — confirmed via live browser testing on `localhost` during the original AuthNet-only phase. Full manual sandbox verification of all 4 processors can only happen over real HTTPS (production, or a tunnel), not on bare `localhost`.
- **What's still needed before this goes live:** (1) set `ENCRYPTION_KEY` in Coolify (runtime-only secret, same as the others); (2) for each contractor who wants card charging, they get their own sandbox credentials from whichever processor they pick and enter them in Settings; (3) one sandbox charge per provider from each of the two UI entry points, voided afterward.
- **Known limitation**: the old `PAYMENTS_MODE=mock`/`ALLOW_MOCK_PAYMENTS` env-based mock-provider escape hatch was removed along with the global AuthNet-only factory it belonged to — there's no equivalent "simulate a successful charge with zero setup" path in the new per-tenant model yet. Local UI verification (does the form render/fail gracefully) still works with fake placeholder credentials in a `PaymentGatewayConfig` row; verifying an actual successful charge requires real sandbox credentials from a real processor account.

## Stripe subscription billing (HandyQuote's own $29/mo Pro plan)

**Separate concern from contractor deposit/invoice collection above — do not conflate.** This is HandyQuote charging the *contractor* for using the product; deposits are the contractor charging *their* customer.

- Checkout (hosted) + Customer Portal (hosted) — zero custom card UI. Routes: `POST /api/billing/checkout`, `POST /api/billing/portal` (both owner-only), `POST /api/stripe/webhook` (public, signature-verified, no rate limit — Stripe retries aggressively, signature is the real gate).
- `src/lib/stripe.ts` — Stripe client singleton + the one pure function (`mapStripeSubscriptionToBusinessFields`) every webhook handler routes through. `resolveBilling()` in `src/lib/billing.ts` is untouched and remains the single source of truth; the webhook is the only writer of `plan`/`trialEndsAt` on Stripe's behalf.
- Webhook idempotency: `StripeEvent` table, event id insert is the atomicity gate (P2002 = already processed), same idiom as `payments/record/route.ts`'s idempotency key. Out-of-order delivery guarded by `Business.stripeLastEventAt` + a `SELECT ... FOR UPDATE` row lock before every write — Stripe does not guarantee event ordering.
- Admin/Stripe interaction is intentionally lightweight (Al's call, 2026-07-13): no precedence system in code. `/admin` shows a business's live `stripeCustomerId`/`stripeSubscriptionStatus` read-only; convention is "cancel in Stripe first" before manually overriding `plan` on a business with a real subscription.
- **Env vars required** (fail-closed via `required()` in `config.ts`, no dev fallback — each local `stripe listen` mints its own webhook secret): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`.
- **What's still needed before this goes live:** Al creates the Stripe product/price + provides test-mode keys → local test via `stripe listen --forward-to localhost:3700/api/stripe/webhook` → same three vars added to Coolify + real webhook endpoint registered in Stripe dashboard → swap to live-mode keys.
- Gotcha for future agents: the installed `stripe` npm package pins its own default API version (check `node_modules/stripe/esm/apiVersion.js` — do NOT guess a version string, it must match what's actually installed or requests can fail at runtime). Bump `src/lib/stripe.ts`'s `apiVersion` deliberately alongside any `stripe` package upgrade.

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
