# HandyQuote — Product Requirements & Working Doc

## Original problem statement
"Look at my hand invoicing tool, want to make this better, from front end to backend
with how it is built to be an invoicing tool for contractors to use but really any business."

User choices: broad pass (frontend + backend), rebrand & generalize to any business,
UI direction left to agent's discretion.

## What this is
A multi-tenant SaaS (formerly **HandyQuote**, now **HandyQuote**) for estimates,
e-signature, invoices, and payments — repositioned from contractor-only to **any business**.

## Architecture
- **Next.js 16 (App Router)** — frontend + API routes in one app on port 3000.
- **Prisma + PostgreSQL** — data layer (Business, User, Customer, Quote, Invoice, Payment, etc.).
- Auth: JWT session cookie `hq_session` (jose), bcrypt passwords, owner/staff roles, platform admin.
- Stripe (Pro $29/mo billing) + per-tenant payment gateways (Authorize.net/Stripe/Square/PayPal), Resend email, R2 photo storage.
- Vitest unit tests across lib/.

### Preview-environment runtime (non-default stack notes)
- Runs as a **production build** (`next start`) — NOT dev mode. Dev-mode HMR websocket
  is blocked by the k8s ingress, which broke client hydration (login form). Production build fixes it.
- Supervisor programs (in `/etc/supervisor/conf.d/nextapp.conf`):
  - `dbboot` — runs `/app/scripts/preview-bootstrap.sh`: reinstalls Postgres+socat if missing,
    keeps PGDATA in `/app/.local/pgdata` (persists across pod resumes since only `/app` persists),
    runs `prisma db push` + seeds once.
  - `nextapp` — `next start` on :3000 (NODE_ENV=production).
  - `apiproxy` — `node /app/scripts/proxy.js` forwards :8001 -> :3000 (ingress routes /api to 8001).
- After code changes you MUST rebuild: `cd /app && NODE_ENV=production npx next build --webpack` then `supervisorctl restart nextapp`.

## Demo credentials
Owner `demo@quickhandyquote.com` / `demo-demo-demo`; Staff `staff@quickhandyquote.com` / `demo-demo-demo`.
Workspace: **Northwind Studio** (plan=pro). Reseed: `cd /app && npm run db:seed`.

## Done (2026-07-20)
- Got the app running in-environment (installed/persisted Postgres, node proxy, production build).
- **PDF export**: native PDFs (pdfkit) for estimates & invoices — authed routes `/api/quotes/[id]/pdf`,
  `/api/invoices/[id]/pdf`, and public `/api/public/estimate/[token]/pdf`. Buttons on estimate/invoice detail + public estimate.
  Note: pdfkit must stay in `serverExternalPackages` (next.config.ts) or it can't find its .afm font files.
- **Recurring invoices**: schedule (weekly/monthly/quarterly/yearly) + "Generate next" clones quote+invoice. `src/lib/recurring.ts`.
- **Payment reminders**: `/api/invoices/[id]/remind` emails the customer (Resend, fails soft) + logs activity + tracks count.
- **Dashboard/analytics**: 6-month revenue bar chart on /reports; "Start from a template" example-estimate quick-start on the dashboard (`/api/quotes/from-preset`).
- Schema additions to Invoice: recurring, recurInterval, recurNextAt, recurParentId, lastReminderAt, reminderCount.
- All four verified via testing agent (iteration_5) — 8/8 UI checks pass. Seed now creates a demo invoice (INV-00001).
- **Client portal** (`/portal/[token]`, public): per-customer shareable link listing all their estimates & invoices with View/Pay (→ `/e/[token]`) + PDF links and an outstanding-balance summary. Portal token on Customer; link + copy button on customer detail. Verified 100% (iteration_6).
- **Automations runner** (`/api/cron/run`, Reports → "Run automations"): generates due recurring invoices and sends overdue payment reminders (7-day cooldown). Verified 100%.
- **Saved cards + auto-charge (Authorize.net CIM)**: customers can save a card on the public payment page (`saveCard` → `profile.createProfile` vaults it, stored in `SavedPaymentMethod`). On recurring invoices the business can auto-charge the saved card each cycle (`generateNextInvoice` → off-session `chargeStoredAuthNetProfile`) or "Charge now" on demand. Files: `lib/saved-methods.ts`, `lib/authnet.ts`, `api/invoices/[id]/auto-charge` & `/charge-saved`. UI verified 100% (iteration_7); all 38 payment unit tests still pass.
  NOTE: real charges require a configured Authorize.net merchant account; the demo has none, so charges fail-closed with a clear reason (`gateway_mismatch`). Stripe off-session (SetupIntent) is a documented follow-up.
- **Rebrand HandyQuote -> HandyQuote**: metadata, logo mark (indigo), wordmark, marketing/pricing/login/signup copy,
  emails, /api/health, error tags, demo email domain. 0 user-visible "HandyQuote" left.
- **Generalized copy** from contractor-only to any business (hero, how-it-works, pricing).
- **Visual refresh**: new indigo brand palette (was teal), Bricolage Grotesque display font, refreshed buttons/shadows.
- **Fixes**: login hydration (prod build), top-nav overlap (widened app bar + PRO pill gated >=1180px),
  data-testids on nav.
- Verified via testing agent: login + all core flows (estimate create/detail, invoice, customer, catalog, settings, reports) pass 100%.
- **Industry starter packs** (`/catalog`): pick an industry, one-click import ready-made price-list items.
  12 industries in `src/lib/industry-presets.ts`; `POST /api/templates/presets` bulk-creates (idempotent by description). UI tested 100%.

## Backlog / Next
- P1: Stripe off-session saved cards (SetupIntent to vault + PaymentIntent off_session) mirroring the Authorize.net CIM flow.
- P2: Wire `/api/cron/run` to a real scheduler (external cron / webhook) for hands-off recurring + reminders + auto-charge.
- P2: Manage saved cards UI on the customer detail page (list/remove vaulted cards).
- Ops: configure a real per-tenant Authorize.net/Stripe gateway to enable live charging; real domain + env keys (Resend/R2); Pro checkout UI.
- P2: Client portal (view all their estimates/invoices in one place).
- Ops: real domain + env keys (Stripe/Resend/R2) for production; wire Pro checkout UI.
