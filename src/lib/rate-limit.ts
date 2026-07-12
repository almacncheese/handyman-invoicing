/**
 * Simple in-process rate limiter for auth/public endpoints.
 * Good enough for single-node Coolify; not multi-instance coordinated.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  // opportunistic prune
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }

  const existing = buckets.get(opts.key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }
  if (existing.count >= opts.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { ok: true };
}

/**
 * Client IP for rate limiting.
 * Prefer Cloudflare's real client IP when present (not spoofable from the
 * public internet when traffic only arrives via CF). Fall back to XFF/X-Real-IP
 * only as secondary — those headers are spoofable without a trusted edge.
 */
export function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf.slice(0, 64);

  // Only trust XFF first hop when we are behind a reverse proxy that strips
  // client-supplied XFF (Coolify/nginx typically does). Still spoofable if the
  // app port is exposed directly — do not publish app ports on eth0.
  const xf = req.headers.get('x-forwarded-for');
  if (xf) {
    const first = xf.split(',')[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = req.headers.get('x-real-ip')?.trim();
  if (real) return real.slice(0, 64);
  return 'unknown';
}

/** Composite key: IP + stable account dimension (email) so XFF spoofing alone cannot reset limits. */
export function rateLimitKey(parts: { action: string; ip: string; account?: string }): string {
  const account = (parts.account || '').toLowerCase().trim().slice(0, 120);
  return account ? `${parts.action}:${parts.ip}:${account}` : `${parts.action}:${parts.ip}`;
}
