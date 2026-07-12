# Handy Invoicing / HandyQuote Test Plan - LIVE UPDATE 2026-07-12

**Test Engineer Mandate**: Enforce TDD and regression safety. No rubber-stamp. All acceptance criteria covered.

## Latest Priorities (per Al 'go' + pricing changes)
1. **Billing invariants**: Exactly 3 invoice lifetime cap on Starter tier enforcement (DB + API gate). Monthly-only subscriptions. No annual option.
2. **Authz/IDOR** on all quote/invoice/customer routes.
3. **Payment** idempotency, webhook handling, Starter → Pro upgrade flow.
4. **Quote lifecycle** with void/convert/decline guards.
5. **Feature gating** tests for all plans.

## Definition of Done for Launch
- npm test green on clean checkout.
- All ACCEPTANCE.md items have corresponding tests.
- 3-invoice cap cannot be bypassed (red-green tests).
- Security + payment sign-off documented.
- `npm run build` succeeds.

## Tests Actively Being Added Right Now
- `src/lib/billing.test.ts` - new tests for Starter cap, monthly plans.
- Route handler tests for upgrade flows.
- Integration smoke for public estimate + pay.

Status: Writing failing tests first, then implementing fixes. Repo commits visible at github.com/almacncheese/handyman-invoicing

Team is parallel: me on tests, others on code/UI/docs. Updates every few hours.