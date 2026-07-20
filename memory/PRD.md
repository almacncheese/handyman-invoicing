# Ledgerly — Product Requirements & Working Doc

## Original problem statement
"Look at my hand invoicing tool, want to make this better, from front end to backend
with how it is built to be an invoicing tool for contractors to use but really any business."

User choices: broad pass (frontend + backend), rebrand & generalize to any business,
UI direction left to agent's discretion.

## What this is
A multi-tenant SaaS (formerly **HandyQuote**, now **Ledgerly**) for estimates,
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
Owner `demo@ledgerly.app` / `demo-demo-demo`; Staff `staff@ledgerly.app` / `demo-demo-demo`.
Workspace: **Northwind Studio** (plan=pro). Reseed: `cd /app && npm run db:seed`.

## Done (2026-07-20)
- Got the app running in-environment (installed/persisted Postgres, node proxy, production build).
- **Rebrand HandyQuote -> Ledgerly**: metadata, logo mark (indigo), wordmark, marketing/pricing/login/signup copy,
  emails, /api/health, error tags, demo email domain. 0 user-visible "HandyQuote" left.
- **Generalized copy** from contractor-only to any business (hero, how-it-works, pricing).
- **Visual refresh**: new indigo brand palette (was teal), Bricolage Grotesque display font, refreshed buttons/shadows.
- **Fixes**: login hydration (prod build), top-nav overlap (widened app bar + PRO pill gated >=1180px),
  data-testids on nav.
- Verified via testing agent: login + all core flows (estimate create/detail, invoice, customer, catalog, settings, reports) pass 100%.

## Backlog / Next
- P1: Native PDF export for estimates & invoices (currently browser print).
- P1: Recurring invoices + payment reminders (dunning).
- P2: Industry presets (line-item templates per trade/industry) to reinforce "any business".
- P2: Dashboard analytics (revenue trends, aging report).
- P2: Client portal (view all their estimates/invoices in one place).
- Ops: real domain + env keys (Stripe/Resend/R2) for production; wire Pro checkout UI.
