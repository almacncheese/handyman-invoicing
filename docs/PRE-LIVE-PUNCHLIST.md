# HandyQuote — pre-live punch list (from 2026-07 adversarial audit)

Source: Claude independent audit (session `1c283081`, artifact report).  
Portfolio gate: `~/dev/_PRE-LIVE-GATE.md`.

## Criticals — status

| # | Finding | Status | Fix location |
|---|---------|--------|--------------|
| C1 | Unscoped seed wipe (`business.deleteMany`) gated by env | **Fixed 2026-07-11** | `prisma/seed.ts` — demo-tenant wipe only; full wipe needs `SEED_WIPE_ALL`+`CONFIRM`, refused in prod |
| C2 | Decline can clobber concurrent accept | **Fixed 2026-07-11** | `decline/route.ts` + `declineWriteGuard()` |
| C3 | Voided quote convertible via `acceptedAt` heal | **Fixed 2026-07-11** | `convert/route.ts` + `canConvertToInvoice()` |
| C4 | Same wipe class / no backup story | Wipe half fixed; **backup still open** | Need off-box `pg_dump` / Coolify backup before more tenants |

## Regression tests locked in

- `src/lib/quote-status.test.ts` — void terminal, convert gate, decline guard shape
- `src/lib/quote-invoice.test.ts` — void cannot build invoice

## Highs still open (not stop-ship for current deferred card payments, but track)

- [ ] Rate limit not solely on spoofable XFF (prefer trusted edge IP)
- [ ] Payment record: client idempotency key + atomic balance increment
- [ ] Enforce `canTransition` on every status-mutating route (not only void/convert)
- [ ] Quote/invoice number allocation under concurrency
- [ ] List pagination
- [ ] Route-level tests + CI
- [ ] Backups + monitoring on single-VPS topology

## Strengths to preserve

Tenant isolation (404), integer cents, server totals, public token design, Zod on bodies, fail-closed secrets.

## Next adversarial pass

Re-run `/pre-live-gate` or Claude adversarial after payment/Pro checkout lands — money path was intentionally 501 and still needs the full claim-before-charge + ledger review when enabled.
