# HandyQuote — Product Contract

**Product:** HandyQuote (`handyman-invoicing`)  
**Owner:** Al / Smith Web Co  
**Stage:** Local product complete (no live card payments) → domain **quickhandyquote.com** owned (Hostinger); Coolify go-live gated on Al  
**Prod URL:** `https://quickhandyquote.com`

## Positioning

Multi-tenant SaaS for handymen and field contractors: professional estimates on a phone, customer e-sign, invoices, and **manual** deposit tracking. Live card processors are explicitly out of this build.

## Users

1. **Owner** — business settings, team, estimates, invoices  
2. **Staff** — create/send estimates, customers, price list  
3. **Customer** — public branded estimate, accept/decline, signature  

## In scope (this build)

| Area | Status |
|------|--------|
| Auth + multi-tenant business | Yes |
| Staff invite (owner) | Yes |
| Customers CRUD + history | Yes |
| Price list / line templates | Yes |
| Estimate builder (material margin, labor, flat, photos, job type) | Yes |
| Server-authoritative totals | Yes |
| Lifecycle draft→sent→viewed→accepted/declined→invoiced→paid/void | Yes |
| Public link + e-sign + decline | Yes |
| Share via copy / SMS / email deep links | Yes |
| Print / PDF (browser) | Yes |
| Invoice conversion + detail | Yes |
| Manual payment records (cash/check/Zelle/etc.) | Yes |
| Resend email (estimate, invite, password reset) | Yes |
| Password reset | Yes |
| Platform admin console | Yes |
| Activity timeline | Yes |
| Dashboard filters + metrics | Yes |
| Branding, terms, payment handles (display only) | Yes |

## Pricing (product)

| Plan | Price | Notes |
|------|-------|--------|
| **Trial** | $0 for **14 days** | Full product; then must upgrade |
| **Pro** | **$29/mo** | Ongoing subscription — no free forever tier |

Signup creates `plan=trial` + `trialEndsAt` (+14 days). Sending estimates is blocked after trial without Pro (HTTP 402). Card checkout for Pro is next; marketing must never promise free forever.

## Out of scope (this build)

- **Live card payments** (Authorize.net / Stripe charge UI for deposits) — routes return 501  
- **Stripe/subscription checkout UI** for HandyQuote Pro (enforcement + pricing live; payment collection next)  
- QuickBooks / accounting sync  
- Supplier catalog APIs  
- Native mobile apps  
- SMS delivery (device `sms:` deep links still available)  

## Demo path

1. Login `demo@quickhandyquote.com` / `demo-demo-demo`  
2. Settings + price list + customers  
3. New estimate → send link → customer signs  
4. Convert to invoice → record cash/Zelle when money arrives  

## Sister product

`~/dev/aim-estimator` — single-tenant PHP proof for AIM. HandyQuote is the multi-tenant SaaS generalization.
