import { jsonError } from '@/lib/http';

/** Online card pay disabled — customers e-sign; contractor records payment offline. */
export async function POST() {
  return jsonError(
    'Online card payment is not available. Contact the contractor to arrange payment.',
    501,
    { code: 'PAYMENTS_DISABLED' },
  );
}
