import { jsonError } from '@/lib/http';

/**
 * Live card charging is intentionally disabled in this product build.
 * Use POST /api/payments/record for manual cash/check/Zelle bookkeeping.
 */
export async function POST() {
  return jsonError(
    'Card payments are not enabled in this release. Record cash, check, or Zelle payments instead.',
    501,
    { code: 'PAYMENTS_DISABLED' },
  );
}
