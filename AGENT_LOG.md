# AGENT_LOG.md — handyman-invoicing

---

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

## 2026-07-11 — Grok: ship hygiene + brand logo

**Did:** Locked in stranded product tree (config → prisma → app → docs commits). Built HandyQuote brand: SVG mark + lockup, rich app icon, `BrandLogo` on marketing/app/auth, favicon metadata. Tests 27/27, typecheck green. Pushed to origin/main.
**Found:** Almost entire SaaS was uncommitted vs early scaffold — highest risk was data loss, not missing features. Logo was CSS pseudo-element only; no product mark assets.
**Status:** Git durable; brand present. Next: Coolify staging + domain when Al picks one; then Resend email. Card pay still deferred.

---

## 2026-07-10 — Grok: full product minus live payments

**Did:** Built out real SaaS surface without card processing: activity timeline, estimate search/status filters, customer detail+edit/delete, staff invite, public decline, job types, invoice detail pages, manual-only payment records, charge/public-pay return 501. Seed with owner+staff. Product contract + README updated. Smoke covers accept→invoice→manual cash.
**Found:** Session cookies after reseed point at deleted business until re-login.
**Status:** Local product is feature-complete for estimate/sign/invoice workflow; payments processors deferred.

---

## 2026-07-10 — Grok: bug audit + button hardening

**Did:** Full action audit. Fixed critical **Copy/Send link after viewed** (assertTransition blocked re-share). Send route now first-send vs re-share. Convert idempotent + signature lag. Charge auto-creates invoice, caps at amount due, try/finally on all client actions. Settings logoUrl empty string, mobile dock includes Settings, smoke script `scripts/smoke.sh` green end-to-end.
**Found:** Re-share after customer open was 409 — main “button not working” report. Busy flags stuck on errors. Settings validation rejected empty logo URL.
**Status:** Smoke SMOKE_OK; not $1M-ready (billing/multi-tenant SaaS plan/email still missing) but core estimate→pay path is solid.

---

## 2026-07-10 — Grok: UI recalibration (ops system, not game)

**Did:** Scrapped caution-tape / hard-shadow “ticket game” look. Rebuilt as calm field-ops software: Source Sans 3, deep workwear green accent, white cards, soft borders, normal status pills, professional sidebar labels (Estimates / Invoices / Customers / Price list / Settings). Tone: Jobber-adjacent seriousness, outdoor-readable contrast, no arcade chrome.
**Found:** User feedback — previous UI felt like a game, not contractor software.
**Status:** Second design pass live at :3000; hard refresh recommended.

---

## 2026-07-10 — Grok: Job Ticket UI redesign

**Did:** First distinctive UI pass (manila/caution/industrial). Later rejected as gamey.
**Status:** Superseded by ops-system pass.

---

## 2026-07-10 — Grok: product polish for revenue

**Did:** Money-focused polish: business settings (brand, tax/deposit defaults, Zelle/CashApp/Venmo, terms); line-item catalog; quote numbers; photos (compressed client-side); dashboard pipeline metrics; invoices list; customer deposit pay after accept; offline cash/Zelle record; duplicate/void; print/PDF page; sales landing + pricing; seed with catalog + payment handles. Tests 26/26, build green.
**Found:** Prisma migrate dev non-interactive → used `db push`. Public pay auto-converts accepted→invoice then charges.
**Status:** Local product is feature-rich for field handymen; deploy/domain still deferred.

---

## 2026-07-10 — Grok: bootstrap full local MVP

**Did:** Claimed repo; product contract + decisions; Next.js 16 scaffold; core libs (cents calc, authz, status, invoice convert, payments claim); Prisma schema + init migration; auth/session APIs; quotes/customers/public/payments routes; mobile-first UI (dashboard, builder, public e-sign); multi-stage Dockerfile; seed demo; Vitest tests; production build; end-to-end API smoke.
**Found:** Original GitHub scaffold was docs-only. Host port 5432 already in use — used existing Postgres. Next → 16.2.10.
**Status:** Local MVP runnable.

---
