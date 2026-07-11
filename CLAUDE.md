# HandyQuote (handyman-invoicing)

Multi-tenant handyman estimating SaaS. Read `AGENT_NOTES.md` + `PRODUCT_CONTRACT.md` first.

- Money in **integer cents**; `src/lib/calculations.ts` is source of truth
- Auth: jose cookie session — handler is the boundary
- Payments: claim-before-charge in `/api/payments/charge`
- Public estimates: `/e/{token}` with token shape guard
- Tests: `npm test` (Vitest). Do not switch to Jest.
- Deploy only on Al's go — Coolify/Hostinger later
