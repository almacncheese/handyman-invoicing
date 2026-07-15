# HandyQuote — pre-live punch list (from 2026-07 adversarial audit)

Source: Claude independent audit (session `1c283081`, artifact report).  
Portfolio gate: `~/dev/_PRE-LIVE-GATE.md`.

## Criticals — status

| # | Finding | Status | Fix location |
|---|---------|--------|--------------|
| C1 | Unscoped seed wipe (`business.deleteMany`) gated by env | **Fixed 2026-07-11** | `prisma/seed.ts` — demo-tenant wipe only; full wipe needs `SEED_WIPE_ALL`+`CONFIRM`, refused in prod |
| C2 | Decline can clobber concurrent accept | **Fixed 2026-07-11** | `decline/route.ts` + `declineWriteGuard()` |
| C3 | Voided quote convertible via `acceptedAt` heal | **Fixed 2026-07-11** | `convert/route.ts` + `canConvertToInvoice()` |
| C4 | Same wipe class / no backup story | Wipe fixed; **VPS cron LIVE 2026-07-12** | `/opt/handyquote-backup.sh` + `/etc/cron.d/handyquote-backup` |

## Regression tests locked in

- `src/lib/quote-status.test.ts` — void terminal, convert gate, decline guard shape
- `src/lib/quote-invoice.test.ts` — void cannot build invoice
- `src/lib/rate-limit.test.ts` — CF IP preference
- `src/lib/pagination.test.ts`, `quote-numbers.test.ts`

## Highs

- [x] Rate limit prefers `cf-connecting-ip`; login uses IP+email composite key
- [x] Payment record: required client idempotency key + `SELECT FOR UPDATE` + increment
- [x] Send/void/convert/decline use shared status gates
- [x] Quote numbers via atomic `increment`; invoice numbers under business row lock
- [x] List pagination (`page` meta) on quotes / invoices / customers
- [x] GitHub Actions CI (`npm test` + typecheck + build)
- [x] Backup script + **VPS cron installed** (`/opt/handyquote-backup.sh`, 03:15 UTC); optional off-box rclone
- [x] Photo count/size guards enforced on quote write + upload (`preparePhotosForWrite`)
- [x] Public estimate GET rate-limited
- [x] `error.tsx` + `global-error.tsx` recovery UI
- [ ] Full route-level integration tests (lib tests + CI cover criticals; e2e still thin)
- [x] Per-tenant card gateways (AuthNet/Stripe/Square/PayPal) built 2026-07-14; audit fixes 2026-07-15 — see `docs/AUDIT-2026-07-15.md`
- [ ] Coolify `ENCRYPTION_KEY` + sandbox E2E per processor before real card money
- [ ] Pro Stripe checkout awaiting platform keys (`STRIPE_*`)
- [ ] Third-party error tracking SDK (Sentry etc.) — console structured log only for now

## Strengths to preserve

Tenant isolation (404), integer cents, server totals, public token design, Zod on bodies, fail-closed secrets.

## Next adversarial pass

2026-07-15 full platform audit: `docs/AUDIT-2026-07-15.md` (critical deposit/balance UI mismatch, public confirm invoice scope, Stripe intermediate-status + cancel-at-provider fixed; 260 tests green). Re-run after Coolify `ENCRYPTION_KEY` + first sandbox charges.
