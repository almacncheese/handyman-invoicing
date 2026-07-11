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

export function getPaymentsMode(): 'mock' | 'authorize_net' {
  const mode = (process.env.PAYMENTS_MODE || '').toLowerCase();
  if (mode === 'mock') return 'mock';
  if (mode === 'authorize_net' || mode === 'authnet') return 'authorize_net';
  // Auto: use AuthNet when keys present
  if (
    process.env.AUTHORIZE_NET_API_LOGIN_ID &&
    process.env.AUTHORIZE_NET_TRANSACTION_KEY
  ) {
    return 'authorize_net';
  }
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_PAYMENTS !== 'true') {
    // Production without keys still boots, but charges will fail closed in provider factory
    return 'authorize_net';
  }
  return 'mock';
}

export function appUrl(): string {
  return process.env.APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
}

/** Resend: set RESEND_API_KEY + RESEND_FROM_EMAIL in Coolify for production mail. */
export function getResendFrom(): string {
  return process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || 'HandyQuote <onboarding@resend.dev>';
}
