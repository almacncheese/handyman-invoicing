# Deploy — quickhandyquote.com

**Domain (owned):** `quickhandyquote.com` — Hostinger registrar  
**Hosting target:** Coolify on Hostinger VPS (`72.62.169.186` pattern)  
**Repo:** `almacncheese/handyman-invoicing` (private)  
**Status:** Domain chosen · **prod deploy gated on Al’s explicit go**

## Canonical URLs

| Env | `APP_URL` |
|-----|-----------|
| Local | `http://localhost:3000` |
| Production | `https://quickhandyquote.com` |

Also serve **`www.quickhandyquote.com` → apex** (301) so estimate links stay consistent.  
Public estimate links and share deep-links use `APP_URL` (`src/lib/config.ts` → `appUrl()`). **Wrong `APP_URL` in Coolify = broken share/sign links.**

## DNS (Hostinger)

Point the domain at the VPS / Coolify proxy (not “Hostinger Website Builder” hosting unless Al chooses that):

1. Hostinger → **Domains** → `quickhandyquote.com` → **DNS / Nameservers**
2. Prefer: keep nameservers at Hostinger **or** Cloudflare (if you put CF in front later)
3. Records (typical Coolify + reverse proxy):

| Type | Name | Value | Notes |
|------|------|--------|------|
| **A** | `@` | VPS public IP | Apex → Coolify/Traefik |
| **CNAME** | `www` | `quickhandyquote.com` | Or A → same IP |
| **A/AAAA** | (none extra) | — | Don’t leave parking/default Hostinger site on `@` |

4. After Coolify issues certs: confirm HTTPS on apex + www redirect.
5. **Do not** publish the app container port on eth0; only the proxy (80/443). Portfolio lesson: published app ports bypass Cloudflare/nginx limits.

## Coolify

1. New resource → **Dockerfile** from this repo (`main`).
2. Domain: `quickhandyquote.com` (+ `www` if Coolify supports multi-host).
3. Env (from `.env.example` — **real values**, never commit):

| Var | Prod value |
|-----|------------|
| `NODE_ENV` | `production` |
| `APP_URL` | `https://quickhandyquote.com` |
| `AUTH_SECRET` | long random (fail-closed if missing) |
| `DATABASE_URL` | Coolify Postgres URL for this app |
| `PAYMENTS_MODE` | `mock` until card pay is green-lit (`ALLOW_MOCK_PAYMENTS=true` if using mock in prod) |

4. Health check: **`/api/health`**
5. Release command / start: app already `next start`; ensure migrate runs once per deploy:
   - `npx prisma migrate deploy` (before or as entry step)
6. Resource limits + `restart: on-failure:5` (portfolio Docker lesson).

## Pre-flight (before first go-live)

- [ ] `npm test` + `npm run build` green locally  
- [ ] No secrets in git (`git status` clean of `.env`)  
- [ ] Real `AUTH_SECRET` + `DATABASE_URL` in Coolify only  
- [ ] `APP_URL=https://quickhandyquote.com`  
- [ ] DNS A/`www` pointed; TLS green  
- [ ] Login + send estimate + open public link on a **phone** (not just laptop)  
- [ ] Card charges still 501 / manual record only — intentional  

## Post-deploy verify

```bash
curl -sS https://quickhandyquote.com/api/health
# Expect JSON ok — check at origin if CF caches later
```

Then: sign in → create estimate → copy public link → open on phone → e-sign path.

## Out of scope until asked

- Live AuthNet/Stripe charges  
- Resend production email domain (`mail.quickhandyquote.com` / SPF/DKIM)  
- SaaS billing for HandyQuote Pro  

## Email later (when Resend lands)

- Sending domain: `quickhandyquote.com` (or `mail.quickhandyquote.com`)  
- SPF/DKIM/DMARC at Hostinger DNS  
- From: something like `estimates@quickhandyquote.com`
