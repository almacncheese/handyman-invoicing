# HandyQuote

**Estimates, e-signature, and invoices for field contractors** — multi-tenant SaaS.

**Production domain:** [quickhandyquote.com](https://quickhandyquote.com) (Hostinger-owned; deploy via Coolify — see `DEPLOY.md`).

Live **card payments are intentionally not in this build**. Contractors send professional estimates, customers sign on their phone, and any money received is recorded manually (cash / check / Zelle / Cash App / Venmo).

## Local setup

```bash
cp .env.example .env
# Postgres on DATABASE_URL (docker compose up -d postgres, or local Postgres)
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open http://localhost:3000

### Demo accounts

| Role  | Email | Password |
|-------|-------|----------|
| Owner | `demo@quickhandyquote.com` | `demo-demo-demo` |
| Staff | `staff@quickhandyquote.com` | `demo-demo-demo` |

Production: https://quickhandyquote.com — same demo after seed.

## What you get

- Multi-tenant workspaces + staff invite  
- Customers with history  
- Price list (saved materials / labor / fees)  
- Estimate builder: margin, labor hours, photos, job type  
- Public customer link: e-sign, decline, print/PDF  
- Share: copy, SMS, email deep links  
- Convert to invoice; manual deposit tracking  
- Activity timeline, dashboard filters, metrics  
- Business branding + terms  

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server |
| `npm test` | Vitest unit tests |
| `npm run build` | Production build |
| `npm run db:seed` | Demo data |
| `bash scripts/smoke.sh` | API smoke (no card charges) |

## Docs

- `PRODUCT_CONTRACT.md` — scope  
- `DECISIONS.md` — architecture choices  
- `AGENT_NOTES.md` — agent memory  
- `DEPLOY.md` — Coolify later  

## Deploy

Domain **quickhandyquote.com** is set. Coolify checklist + DNS: **`DEPLOY.md`**.  
Prod env must include `APP_URL=https://quickhandyquote.com`, real `AUTH_SECRET`, and `DATABASE_URL`. Card payments stay deferred until Al green-lights a processor.
