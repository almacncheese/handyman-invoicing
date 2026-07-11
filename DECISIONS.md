# Architecture decisions (questioned, then chosen)

## Stack

| Option | Decision | Why |
|--------|----------|-----|
| PHP like aim-estimator | **No — Next.js 15 App Router + TS** | SaaS multi-tenant on Coolify/VPS matches poolstride/fflcommand; AIM’s shared-hosting PHP is the right call for a single client site, not a product |
| Prisma + Postgres | **Yes** | Coolify-friendly; JSON types for line items if needed; migrations ship cleanly |
| SQLite for local only | **No as primary** | Dual drivers cause drift; local Postgres via Docker is cheap and matches prod |
| NextAuth | **No — jose + httpOnly cookie session** | Fail-closed `getSession()`; no `AUTH_SECRET \|\| 'dev-default'`; lessons from fflcommand |
| Jest | **Vitest** | Existing red test already imports vitest; faster TS unit tests |
| Float dollars | **Integer cents** | Avoid float money bugs; display layer formats |
| shadcn full kit day 1 | **Minimal Tailwind + small components** | Ship the flow first; add component library when UI stabilizes |
| Authorize.net only | **Provider interface + mock + AuthNet sandbox** | Local/tests run without keys; real AuthNet when `AUTHORIZE_NET_*` set. Field-order lessons from ffl-core ENGINEERING-NOTES |
| Stripe instead | **No for MVP** | Product brief and Al’s FFL stack already center on AuthNet; can add Stripe later behind same `PaymentProvider` |

## Domain model

- **Business** = tenant boundary (everything filters on `businessId`).
- **User** belongs to one business (MVP); role `owner | staff`.
- **Customer** per business.
- **Quote** with `lineItems` JSON (typed in TS) + denormalized total cents for list queries.
- **Invoice** created once from accepted quote; `quoteId` unique.
- **Payment** with `idempotencyKey` unique; status machine; never charge before row claim.

## Security invariants (from Al’s production lessons)

1. Handler is the authz boundary — middleware cookie-exists is not enough.
2. Public tokens: shape-guard regex **before** DB; `hash_equals` on lookup; opaque 404.
3. Totals server-authoritative on every save/charge.
4. Payments: atomic conditional update claim **before** calling AuthNet.
5. Secrets by name in docs/logs; fail boot if prod secret missing.
6. Never trust client role/price/flags.

## Deploy path (later — not this session)

Local → perfect → pick domain → Coolify on Hostinger VPS (`72.62.169.186` pattern). No prod deploy until Al says go.
