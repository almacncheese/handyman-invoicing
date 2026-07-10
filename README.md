# HandyQuote / Handyman Invoicing SaaS

**SaaS tool for handymen and contractors to build quotes fast: automate material costs + margins + labor/time, edit quotes, convert to invoices, accept payments via Authorize.net.**

## Features (MVP)
- Smart quote builder with line items (materials, labor, flat fees)
- Margin and labor calculators
- Editable quotes → Invoices
- Customer approval, e-sign, shareable links
- Custom branding (logo per business)
- Authorize.net payments
- QuickBooks sync (planned)
- Sales tax handling

## 5-Minute Local Setup

1. Clone the repo
2. `cp .env.example .env`
3. `docker compose up -d` (starts Postgres)
4. `npm install`
5. `npm run db:migrate`
6. `npm run dev`

Open http://localhost:3000

## Scripts
- `npm run dev` - Development
- `npm run build` - Build for production
- `npm run start` - Start production
- `npm run lint` - Lint
- `npm test` - Test
- `npm run db:migrate` - Prisma migrate
- `npm run db:seed` - Seed DB

## Deploy
See DEPLOY.md for Coolify/Docker instructions.

## Stack
- Next.js 15 App Router + TypeScript
- Tailwind + shadcn/ui
- Prisma + PostgreSQL
- Authorize.net integration

Contribute: See issues and PRs.