# Handy Invoicing / HandyQuote Test Plan

**Test Engineer Mandate**: Enforce TDD and regression safety. Write failing tests FIRST for all security, money, and core business invariants.

## Core Principles
- Red-Green-Refactor
- Fast unit tests > slow E2E
- Vitest + TS for pure libs and route handlers (Request mocks)
- Co-located `*.test.ts` or `tests/` dir
- `npm test` must be green on clean checkout for DoD

## Priorities (in order)
1. **Authz & IDOR** - Tenant isolation, ownership checks on quotes/invoices/customers.
2. **Payments & Idempotency** - Authorize.net transactions, prevent double-charges with keys, atomic recording.
3. **Quote → Invoice Flow** - Invariants: totals match, no double invoicing, state machine (draft/quoted/invoiced/paid).
4. **Calculations** - Material cost + margin + labor (hours*rate) + taxes/discounts accuracy.
5. **Validation** - Edge: zero/negative values, max line items, currency precision (2 decimals).
6. **Happy path** - UI smoke optional (Playwright later).

## Definition of Done for any feature
- Relevant tests written BEFORE implementation code.
- `npm test` passes.
- No skipped tests on critical paths.
- Coverage >80% on lib/payment/calc modules.

## Initial Test Suite (to create immediately)
- `lib/calculations.test.ts` : test `calculateQuoteTotal`, margin application, labor calc.
- `lib/authz.test.ts` or middleware tests: resource ownership.
- `app/api/payments/route.test.ts`: mock Authorize.net, idempotency.
- `lib/quote-invoice.test.ts`: conversion logic.

## Next Actions
1. Scaffold Next.js + Vitest project (package.json, vitest.config.ts, tsconfig).
2. Add failing tests.
3. Implement minimal passing code.
4. Add CI with tests.

Refuse to mark 'done' without passing acceptance tests.

See ACCEPTANCE.md for full user stories once defined.
