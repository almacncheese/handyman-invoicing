# Acceptance criteria — HandyQuote MVP

## A1 — Auth & tenant

- [ ] Given no account, when I sign up with email/password/business name, then a Business + owner User exist and I am logged in.
- [ ] Given wrong password, when I login, then 401 and no session cookie.
- [ ] Given valid session, when `AUTH_SECRET` would be missing in production mode, then boot/config fails closed (no forged sessions).
- [ ] Given user A’s quote id, when user B’s session GETs/PATCHes it, then 404 (not 403 with existence leak).

## A2 — Quote math (server)

- [ ] Material line: cost $100, margin 20% → sell $120.00 (12000 cents).
- [ ] Labor: 4h × $50/h → $200.00.
- [ ] Flat fee $75 → $75.00.
- [ ] Tax 8.25% applied to subtotal; deposit 30% of grand total.
- [ ] Saving a quote with client-posted wrong total stores **server** total, not client total.
- [ ] Negative qty/cost rejected with 422.

## A3 — Lifecycle

- [ ] New quote starts `draft`.
- [ ] Send generates public token + status `sent` + `sentAt`.
- [ ] First public open stamps `viewed` + `viewedAt` once.
- [ ] Customer accept + signature → `accepted` + signature artifact; second sign returns already accepted (no clobber).
- [ ] Convert accepted quote → invoice once; second convert 409.

## A4 — Public page

- [ ] Token not matching `^[A-Za-z0-9_-]{20,64}$` never hits DB; 404 page.
- [ ] Valid token shows business branding, line items, totals, sign + pay affordances.
- [ ] No staff chrome / no other customers’ data.

## A5 — Payments

- [ ] Payment with same idempotency key twice → one charge, second returns prior result.
- [ ] Concurrent double-submit cannot create two successful external charges (claim-before-charge).
- [ ] Without AuthNet keys, mock provider succeeds in development; production requires real keys or explicit `PAYMENTS_MODE=mock`.

## A6 — DX

- [ ] `npm test` green.
- [ ] `npm run build` green.
- [ ] `docker compose up -d` starts Postgres; migrate + seed works.
- [ ] Seed login documented in README.
