/**
 * Fail-closed config. Never fall back to a forgeable default secret in production.
 */

function required(name: string, value: string | undefined): string {
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (process.env.NODE_ENV === 'production') {
    return required('AUTH_SECRET', secret);
  }
  // Local only — still explicit, never empty
  return secret || 'dev-only-handyquote-secret-change-me';
}

/**
 * Stripe subscription billing (HandyQuote's own $29/mo Pro plan — separate from
 * the contractor's own deposit/invoice payment collection above).
 * Unlike getAuthSecret(), there is no safe fallback for these even in dev —
 * each local `stripe listen` session mints its own distinct webhook secret.
 */
export function getStripeSecretKey(): string {
  return required('STRIPE_SECRET_KEY', process.env.STRIPE_SECRET_KEY);
}

export function getStripeWebhookSecret(): string {
  return required('STRIPE_WEBHOOK_SECRET', process.env.STRIPE_WEBHOOK_SECRET);
}

export function getStripePriceId(): string {
  return required('STRIPE_PRICE_ID', process.env.STRIPE_PRICE_ID);
}

/**
 * Master key for encrypting tenant payment-gateway secrets at rest
 * (src/lib/crypto.ts). At least as sensitive as the Stripe billing keys — a
 * leak unlocks every tenant's payment secret at once — so no dev fallback.
 */
export function getEncryptionKey(): string {
  return required('ENCRYPTION_KEY', process.env.ENCRYPTION_KEY);
}

export function appUrl(): string {
  return process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
}

/** Resend: set RESEND_API_KEY + RESEND_FROM_EMAIL in production for mail. */
export function getResendFrom(): string {
  return process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || 'HandyQuote <onboarding@resend.dev>';
}
