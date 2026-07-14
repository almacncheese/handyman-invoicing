import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { loadGatewayConfig } from '@/lib/gateway-config';
import { confirmStripeIntent, cancelStripeIntent } from '@/lib/providers/stripe-charge';
import { capturePaypalOrder, cancelPaypalOrder } from '@/lib/providers/paypal-charge';
import { logActivity } from '@/lib/activity';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

/**
 * Contractor phone-entry — phase 2 of the two/three-phase Stripe/PayPal
 * flows. businessId/invoiceId are re-derived from the Payment row itself,
 * never trusted from the client — the client only ever echoes back our own
 * server-generated paymentId.
 */
const schema = z.object({
  paymentId: z.string().min(1),
  action: z.enum(['cancel']).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());

    const row = await prisma.payment.findUnique({ where: { id: body.paymentId } });
    if (!row || row.businessId !== session.businessId) {
      return jsonError('Not found', 404);
    }

    const config = await loadGatewayConfig(session.businessId);
    if (!config || config.provider !== row.provider) {
      return jsonError('Payment gateway configuration has changed since this payment was started', 409);
    }

    const scoped = { businessId: session.businessId, invoiceId: row.invoiceId, paymentId: body.paymentId };

    if (body.action === 'cancel') {
      if (config.provider === 'stripe') {
        return jsonOk(await cancelStripeIntent(scoped));
      }
      if (config.provider === 'paypal') {
        return jsonOk(await cancelPaypalOrder(scoped));
      }
      return jsonError('This provider does not support cancellation via this route', 409);
    }

    if (config.provider === 'stripe') {
      const result = await confirmStripeIntent(config, scoped);
      if (result.outcome === 'not_found') return jsonError('Not found', 404);
      if (result.outcome === 'in_flight') {
        return jsonError('Another confirmation attempt is already in progress — try again shortly', 409);
      }
      if (result.outcome === 'failed') return jsonError(result.errorMessage, 402);

      await logActivity({
        businessId: session.businessId,
        invoiceId: row.invoiceId,
        actorType: 'user',
        actorName: session.email,
        action: 'payment_recorded',
        message: 'Recorded card payment',
        meta: { method: 'card' },
      });
      return jsonOk({ payment: result.payment }, { status: 201 });
    }

    if (config.provider === 'paypal') {
      const result = await capturePaypalOrder(config, scoped);
      if (result.outcome === 'not_found') return jsonError('Not found', 404);
      if (result.outcome === 'in_flight') {
        return jsonError('Another confirmation attempt is already in progress — try again shortly', 409);
      }
      if (result.outcome === 'failed') return jsonError(result.errorMessage, 402);

      await logActivity({
        businessId: session.businessId,
        invoiceId: row.invoiceId,
        actorType: 'user',
        actorName: session.email,
        action: 'payment_recorded',
        message: 'Recorded card payment',
        meta: { method: 'card' },
      });
      return jsonOk({ payment: result.payment }, { status: 201 });
    }

    return jsonError('This business is not configured for the intent-based payment flow', 409);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
