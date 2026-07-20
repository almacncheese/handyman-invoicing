# Test Credentials — Ledgerly

App runs as a Next.js production build (supervisor: `nextapp` on :3000, `apiproxy` node proxy on :8001, `dbboot` initializes Postgres in `/app/.local/pgdata`).

## Demo accounts (seeded via `npm run db:seed`)

| Role  | Email                        | Password        |
|-------|------------------------------|-----------------|
| Owner | demo@quickhandyquote.com     | demo-demo-demo  |
| Staff | staff@quickhandyquote.com    | demo-demo-demo  |

Demo workspace: **Northwind Studio** (plan = pro, so no trial walls).

## Notes
- Login: POST `/api/auth/login` sets `hq_session` cookie.
- Stripe billing + Resend email use placeholder/unset keys (fail soft) — not bugs.
- To reseed: `cd /app && npm run db:seed`.
