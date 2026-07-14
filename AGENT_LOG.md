# AGENT_LOG.md — handyman-invoicing

---

## 2026-07-14 — ⚠️ AUTO-BREADCRUMB (no /end-session) — session 1c283081
**Did (git facts, unverified):** branch `main`; 56 uncommitted file(s): .env.example,AGENT_LOG.md AGENT_NOTES.md,DECISIONS.md package-lock.json,package.json prisma/schema.prisma,src/app/api/admin/overview/route.ts, … (+48 more)
**Last commit:** 2d39b07 fix(audit): photo write guards, public GET rate limit, error UI
**Found:** _(not captured — auto-breadcrumb can't summarize. Write this up from memory, or next time run /end-session.)_
**Status:** dirty tree at session end — a proper AGENT_LOG entry is owed.


## 2026-07-14 — Claude Code (Sonnet 5): Per-tenant payment gateways (Authorize.net/Stripe/Square/PayPal)
**Did:** Al clarified the previous session's Authorize.net work assumed the wrong ownership model — he has no AuthNet account himself; contractors each bring their OWN merchant account. Rebuilt the whole card-charging stack per-tenant: new `PaymentGatewayConfig` table (one row per Business, encrypted secret via new `src/lib/crypto.ts` AES-256-GCM + `ENCRYPTION_KEY`), `src/lib/gateway-config.ts` (`loadGatewayConfig` throws on corruption at charge-time; `publicGatewayConfig` fails closed to null at display-time, never touches the secret). Generalized `card-charge.ts` into shared `claimStatusTransition`/`settleCharge` primitives used by all 4 providers instead of AuthNet-only. One-shot providers (AuthNet unchanged, new `src/lib/providers/square.ts`) still use the single-call `processCardCharge`. Two/three-phase providers (Stripe non-Connect, PayPal non-Partner — their confirm step is inherently client-driven, can't fit the one-shot interface) got new `src/lib/providers/stripe-charge.ts` / `paypal-charge.ts` plus new routes `POST /api/payments/intent` + `/confirm` (and public mirrors) — confirm always independently verifies with the real provider before crediting, never trusts the client's claim alone. Extracted the lazy quote→invoice conversion (previously duplicated) into `resolveInvoiceForPayment()` in `quote-invoice.ts`, shared by both public routes. New Settings UI (`PaymentGatewaySettings.tsx` + owner-only `PUT /api/business/payment-gateway`, secret fields always render blank, "leave blank to keep" only when provider is unchanged) and 4 client card forms (`SquareCardForm`, `StripeCardForm` — new `@stripe/stripe-js` dep, `PaypalButtonForm` — button/popup not a card form since Advanced Card Processing needs partner approval) behind a `PaymentCardForm` switcher component. Removed now-dead global-env code (`getAuthNetPublicConfig`, `createPaymentProvider`, `getPaymentsMode`) since credentials are DB-based now. 118 new/changed tests (256 total), `tsc --noEmit` and `npm run build` clean. Nothing committed (per house rule).
**Found:** Live browser verification (fake credentials, all 4 providers' settings forms, real quote-page + public-estimate-page rendering via the switcher) surfaced a real bug before it reached Al: `createStripeIntent`/`createPaypalOrder` didn't catch a thrown error from the Stripe SDK / PayPal fetch calls, so a bad-credentials attempt left the `Payment` row permanently stuck in `awaiting_confirmation` with no `providerRef` — unlike Authorize.net's genuinely-ambiguous stuck-`processing`-row case (documented, intentional), a thrown create-call error is a *definitive* failure (nothing was ever created at the provider), so it should mark the row `failed` (reclaimable), not leave it stuck forever. Fixed via TDD (new `failed` outcome variant, wired through both intent routes to a 402), then re-verified live: confirmed via direct DB query that the OLD pre-fix stuck row was left untouched (different idempotencyKey) while the NEW attempt correctly settled to `status='failed'` with the real error note. Also confirmed live: Stripe.js explicitly permits testing over plain HTTP (unlike Accept.js/Square's Web Payments SDK, which both hard-refuse) — a real per-tenant Stripe API call using the tenant's own decrypted secret key was exercised end-to-end this way (rejected cleanly by Stripe for the fake key, proving the full encrypt→store→decrypt→call chain works).
**Promoted to NOTES:** Replaced the old "Authorize.net card charging" section with "Per-tenant payment gateways" covering the new architecture, money-safety design, env story (`ENCRYPTION_KEY` only, no more global `AUTHORIZE_NET_*` vars), and what Al still needs to do. New "Things that broke before" row: confirm who actually owns the merchant account before building ANY payment integration. `DECISIONS.md`'s stale "Authorize.net only" MVP line updated to point at the new section.
**Status:** Code complete, tested, builds clean, all 4 providers' settings CRUD + masking + quote-page/public-page rendering verified live in-browser; the stuck-row bug found during this same verification pass was fixed and re-verified. **Not live** — needs Al to (1) set `ENCRYPTION_KEY` in Coolify (runtime secret, generate via `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`), (2) each contractor who wants card charging gets their own credentials from whichever of the 4 processors they pick and enters them in Settings → Payment processor. Claim released.
**Known limitation, not fixed here:** the old `PAYMENTS_MODE=mock`/`ALLOW_MOCK_PAYMENTS` local-dev mock-provider escape hatch was removed along with the global factory it belonged to (now dead code) — there's no "simulate a successful charge with zero setup" path in the new per-tenant model. Local UI verification still works with fake placeholder credentials in a `PaymentGatewayConfig` row; verifying an actual successful charge needs real sandbox credentials from a real processor account.

## 2026-07-13 — Claude Code (Fable 5): Authorize.net card charging (contractor + public)
**Did:** Wired the dormant `PaymentProvider`/`AuthorizeNetProvider` (built in an earlier session, never called) into two live entry points: contractor phone-entry charge on the quote page (`POST /api/payments/charge`) and customer self-serve pay on the signed public estimate (`POST /api/public/estimate/[token]/pay`, with lazy quote→invoice conversion if the contractor hasn't converted yet). New shared core `src/lib/card-charge.ts` (claim-before-charge via Prisma create+catch-P2002+conditional-update, feeding the existing unmodified `interpretPaymentClaim()`, no open DB transaction across the external Authorize.net call) and `src/lib/invoice-credit.ts` (pure crediting arithmetic shared by both routes, `payments/record/route.ts` untouched). Added an `AbortController` timeout (25s) to `authnet.ts`'s fetch call — it had none before. Fixed a real bug found along the way: `rate-limit.ts` unconditionally trusted `cf-connecting-ip`, but this deployment has no Cloudflare in front (confirmed in DEPLOY.md), so that header was fully attacker-controlled — dangerous the moment a public unauthenticated charge endpoint exists (card-testing fraud vector). New `CardChargeForm.tsx` (Accept.js client-side tokenization, card fields never get a `name` attribute so raw card data never touches our form submission). 51 new tests (134 total), `tsc --noEmit` and `npm run build` clean. Nothing committed (per house rule).
**Found:** Authorize.net's Accept.js SDK hard-refuses to tokenize over plain HTTP (`[warn] An HTTPs connection is required to secure delivery of payment information.`) — confirmed via live browser verification on both the contractor and public forms: the Pay button click never reaches our server, Accept.js's own guard fires first, and my component surfaces it as a clean "A HTTPS connection is required." message with no crash/hang and the form stays retryable. This means the actual sandbox-decline/success path can only be verified in production (real HTTPS) or via `npx localtunnel`/similar — not on plain `localhost`. Separately confirmed (again) the pre-existing `Invoice.notes` migration-drift bug (schema declares the column, no migration ever created it — same one noted in the Stripe session) by hitting it on the dashboard page during verification; worked around locally with a raw, untracked `ALTER TABLE` on the throwaway container, left untouched in the tracked migration history since it's out of this task's scope. Local Postgres again collided with `hobbysandp-db` on 5432 — used a standalone container on 5433 again.
**Promoted to NOTES:** New "Authorize.net card charging" section (claim mechanism, never-auto-reclaim-`processing` rule + manual unstick runbook, AVS collection approach, required env vars, HTTPS requirement for local testing, what Al still needs to do). Active known issues + pre-flight checklist updated.
**Status:** Code complete, tested, builds clean, both UI entry points verified in-browser (renders correctly, fails gracefully, retryable). **Not live** — needs Al to (1) get real Authorize.net sandbox API Login ID + Transaction Key + Client Key, (2) test both charge paths against sandbox over real HTTPS (a $1 sandbox charge, voided after), (3) add all three env vars to Coolify (server-only — Client Key is safe to expose but read live, not baked into a `NEXT_PUBLIC_*` build var), (4) separately, someone should author a proper migration for the pre-existing `Invoice.notes` drift — not done here, out of scope. Claim released.
**Still owed to Al, separate from this task:** the `Invoice.notes` migration-drift bug is real and pre-existing (not caused by this session's work) — dashboard page throws a Prisma error reading invoices until a migration adds that column.

## 2026-07-13 — ⚠️ AUTO-BREADCRUMB (no /end-session) — session 1c283081
**Did (git facts, unverified):** branch `main`; 17 uncommitted file(s): .env.example,AGENT_LOG.md AGENT_NOTES.md,package-lock.json package.json,prisma/schema.prisma src/app/api/admin/overview/route.ts,src/app/billing/page.tsx, … (+9 more)
**Last commit:** 2d39b07 fix(audit): photo write guards, public GET rate limit, error UI
**Found:** _(not captured — auto-breadcrumb can't summarize. Write this up from memory, or next time run /end-session.)_
**Status:** dirty tree at session end — a proper AGENT_LOG entry is owed.


## 2026-07-13 — Claude Code (Fable 5): Stripe subscription billing for HandyQuote Pro
**Did:** Built the "Pro Stripe checkout" item flagged as next in the prior entry — real $29/mo subscription billing via Stripe Checkout + Customer Portal (hosted, zero custom card UI). New: `src/lib/stripe.ts` (client singleton + pure `mapStripeSubscriptionToBusinessFields`/`isStaleEvent`), `POST /api/billing/checkout`, `POST /api/billing/portal`, `POST /api/stripe/webhook` (signature-verified, `StripeEvent` idempotency table, `SELECT...FOR UPDATE` row lock + event-timestamp ordering guard against Stripe's non-guaranteed delivery order). Migration `20260713222734_stripe_billing_fields` adds `Business.stripeCustomerId/stripeSubscriptionId/stripeSubscriptionStatus/stripeLastEventAt` + `StripeEvent` table. Billing page gets real Upgrade/Manage buttons; admin console shows Stripe status read-only. TDD throughout (29 new tests, 85 total green), full build/typecheck clean. This is a SEPARATE concern from the contractor's own deposit/invoice payment collection (`src/lib/payments.ts`/`authnet.ts`) — no shared code, deliberately.
**Found:** Preceding session's audit-remediation train (`c61ad8d`…`2d39b07`) had already landed with zero file overlap against this work — confirmed via `git log`/`git show --stat` before proceeding, no schema/migration conflicts. Local dev hit the same `localhost:5432` port collision with `hobbysandp-db` documented in the audit; used a standalone container on 5433 instead this time (not docker-compose, to avoid the port-mapping default). `stripe` npm package pins its own default API version independent of the Stripe dashboard — don't guess a version string for `apiVersion`, read it from `node_modules/stripe/esm/apiVersion.js`.
**Promoted to NOTES:** New "Stripe subscription billing" section (architecture, env vars, admin/Stripe interaction decision, the apiVersion gotcha).
**Status:** Code complete, tested, builds clean. **Not live** — needs Al to (1) create the Stripe product/price + provide test-mode keys, (2) run `stripe listen` locally to test end-to-end with a real checkout, (3) add the same 3 env vars to Coolify + register the prod webhook URL, (4) swap to live-mode keys only after a successful test-mode run. Claim released.

## 2026-07-12 — Grok, session end (HandyQuote / quickhandyquote)
**Did:** Full audit remediation train pushed to `main` through `2d39b07`: criticals (decline race, void→invoice, scoped seed), highs (payment idempotency+FOR UPDATE, CF rate limits, atomic numbers, pagination, CI), VPS backup cron live (`/opt/handyquote-backup.sh` 03:15 UTC), photo write guards + public GET RL + error.tsx/global-error.tsx. Portfolio `/pre-live-gate` + `~/dev/_PRE-LIVE-GATE.md`. Prod smoke green: create→send→sign→invoice→pay + void-convert blocked.
**Found:** Builder-complete ≠ live-safe (sibling writers half-fixed). Prisma `insensitive` needs `as const`/QuoteWhereInput. Backup script must resolve docker container without DATABASE_URL. Demo plan=pro on prod.
**Promoted to NOTES:** DON'T-repeat lifecycle/seed/audit rows; pre-live checklist; backup LIVE paths; known issues pruned (backups cron done; Pro checkout/card still open).
**Status:** Clean main=origin. Live + hardened. Next: Pro Stripe checkout or off-box backups.

## 2026-07-12 — Grok: install HandyQuote DB backup cron on VPS
**Did:** Deployed `scripts/backup-postgres.sh` → `/opt/handyquote-backup.sh`; cron `/etc/cron.d/handyquote-backup` at 03:15 UTC; first dump verified (`handyquote-db` → `/var/backups/handyquote/*.sql.gz`, gzip SQL). Script improved to resolve container without DATABASE_URL.
**Found:** Container name is exactly `handyquote-db` (postgres:16-alpine). Local VPS volume only — off-box rclone still optional.
**Status:** Daily backups live. Off-box copy still nice-to-have.

## 2026-07-11 — Grok: platform hardening train (audit highs + CI + backup)
**Did:** Committed criticals `c61ad8d`. Hardened: payment record (required idempotency + FOR UPDATE), CF-first rate limits + login IP+email key, decline rate limit, atomic quote numbers, locked invoice numbers, list pagination, send status gate, CI workflow, `scripts/backup-postgres.sh` + DEPLOY docs. 49 tests + typecheck + build green.
**Found:** Pagination `mode: 'insensitive'` needs Prisma `as const` / QuoteWhereInput. Remaining product gap: card pay + Pro checkout intentionally still deferred.
**Status:** Ready to commit/push/redeploy; VPS backup cron still needs Al install.

## 2026-07-11 — Grok: pre-live gate process + critical lifecycle fixes
**Did:** Encoded prevention so we don't ship-then-audit again: portfolio `~/dev/_PRE-LIVE-GATE.md`, Grok skill `/pre-live-gate`, Claude command, LESSONS + code-gotchas/deploy-safely/greenfield/subagent preamble. Fixed audit criticals C1–C3: demo-scoped seed (no global wipe), decline race-safe `updateMany`, convert only via `canConvertToInvoice` (no void resurrection). Regression tests; punch list + audit HTML under `docs/`.
**Found:** Root miss was process (builder self-certify, half-fixed sibling writers), not "can't see races." Residual: no automated backups; audit highs (payment record race, XFF limits, CI) still open.
**Status:** Process live globally; criticals fixed; follow-up hardening commit next.

---

## 2026-07-11 — ⚠️ AUTO-BREADCRUMB (no /end-session) — session 1c283081
**Did (git facts, unverified):** branch `main`; 3 uncommitted file(s): AGENT_LOG.md,AGENT_NOTES.md .claude/
**Last commit:** 05cb95a chore(secrets): Keychain vault + pull/write scripts for this machine
**Found:** _(not captured — auto-breadcrumb can't summarize. Write this up from memory, or next time run /end-session.)_
**Status:** dirty tree at session end — a proper AGENT_LOG entry is owed.


## 2026-07-11 — Grok, session end
**Did:** Shipped HandyQuote live at quickhandyquote.com (Coolify+nginx+LE). Brand, DNS, admin (`owner@smithwebco.com`/Keychain), trial→Pro $29, Resend email, password reset/change, Account menu UX audit, reports, R2 photo path, secrets vault (Keychain+scripts). Commits through `05cb95a` / later deploy queues. Payments intentionally deferred.
**Found:** Coolify build-time NODE_ENV + Turbopack layout breaks Docker builds; schema drift vs init migration; discoverability > missing features (password); mid-redeploy blanks look like outages; secrets must leave chat (Keychain+Coolify).
**Promoted to NOTES:** DON'T-repeat docker/ux/schema rows; secrets section already present; known issues (Resend domain, R2 env, payments last); admin/demo logins.
**Status:** Live product-complete except card/Pro checkout. Next: real usage, Resend domain verify, rotate admin password, optional R2 env.

## 2026-07-11 — Resend email + password reset (payments deferred)

**Did:** Resend integration (estimate, staff invite, password reset, signed notify). Forgot/reset pages. Email estimate button. /billing plan page without checkout. RESEND_API_KEY + FROM set in Coolify (runtime). Password-reset columns on prod DB.
**Found:** Resend key was in macOS Keychain as `resend_api_key`. From address defaults to Resend onboarding until domain verified.
**Status:** Code pushed `e9af34c`; redeploy queued. Al should verify `quickhandyquote.com` in Resend for custom from-address. **Payments still last.**

---

## 2026-07-11 — Launch audit: harden + fix + optimize

**Did:** Full audit. Fixed: login inactive users, demo credentials copy, auth rate limits, payment record race (re-read in tx), public view stamp race, middleware UX gate, health checks DB, security headers, seed self-contained + non-wipe prod, smoke for prod demo email. Tests green; deploy pending.
**Found:** Init migration lagged schema (already pushed); seed couldn't run in Docker (src imports); card charge correctly 501.
**Status:** Code ready to ship; verify with live-smoke after deploy.

---

## 2026-07-11 — LIVE: quickhandyquote.com

**Did:** DNS A→VPS via Hostinger API; Coolify app `handyquote` + `handyquote-db` Postgres; fixed Docker builds (devDeps + webpack + minimal layout); deploy green; nginx vhost + Let’s Encrypt; public `/api/health` 200.
**Found:** Coolify injects env as build ARGs — NODE_ENV=production at build broke npm ci; Turbopack + custom layout head broke `/_global-error` prerender. Auth secret rotated after first build leaked ARGs into logs.
**Status:** **https://quickhandyquote.com live.** Mock payments only. Demo seed attempted post-deploy.

---

## 2026-07-11 — Domain: quickhandyquote.com

**Did:** Locked production domain decision — `quickhandyquote.com` owned at Hostinger. Updated DEPLOY.md (DNS A/www, Coolify env incl. APP_URL, health/migrate), AGENT_NOTES, PRODUCT_CONTRACT, README, .env.example, metadataBase.
**Found:** n/a — domain choice only; no deploy run.
**Status:** Domain named. **Go-live still needs Al’s explicit deploy green-light** + Coolify resource + DNS to VPS.

---


---

> Older entries live in AGENT_LOG_ARCHIVE/ (rotated by rotate-agent-log.sh; /recall greps them too).
