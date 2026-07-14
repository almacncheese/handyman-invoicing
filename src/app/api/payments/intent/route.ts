import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { assertSameBusiness } from '@/lib/authz';
import { loadGatewayConfig } from '@/lib/gateway-config';
import { createStripeIntent } from '@/lib/providers/stripe-charge';
import { createPaypalOrder } from '@/lib/providers/paypal-charge';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

/**
 * Contractor phone-entry — phase 1 of the two/three-phase Stripe/PayPal
 * flows (Authorize.net/Square are one-shot and use /api/payments/charge
 * directly). Returns whatever the client SDK needs to drive its own confirm
 * step: a Stripe client_secret or a PayPal orderId.
 */
const schema = z.object({
  invoiceId: z.string().min(1),
  amountCents: z.number().int().positive(),
  idempotencyKey: z.string().min(12).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());
    const key = body.idempotencyKey.trim();

    const invoice = await prisma.invoice.findUnique({ where: { id: body.invoiceId } });
    assertSameBusiness(session, invoice);

    if (invoice!.status === 'void') {
      return jsonError('Invoice is void', 409);
    }
    if (body.amountCents > invoice!.amountDueCents + 1) {
      return jsonError(`Amount exceeds balance due (${invoice!.amountDueCents} cents)`, 422);
    }

    const config = await loadGatewayConfig(session.businessId);
    if (!config) {
      return jsonError('Card charging is not configured for this business', 409);
    }

    if (config.provider === 'stripe') {
      const result = await createStripeIntent(config, {
        businessId: session.businessId,
        invoiceId: invoice!.id,
        amountCents: body.amountCents,
        idempotencyKey: key,
        description: `Invoice ${invoice!.number}`,
      });
      if (result.outcome === 'in_flight') {
        return jsonError('Another payment attempt for this invoice is already in progress — try again shortly', 409);
      }
      if (result.outcome === 'key_reused_for_different_charge') {
        return jsonError('This payment attempt has already been used for a different charge', 409);
      }
      if (result.outcome === 'succeeded') {
        return jsonOk({ outcome: 'succeeded', payment: result.payment });
      }
      if (result.outcome === 'failed') {
        return jsonError(result.errorMessage, 402);
      }
      return jsonOk(
        { paymentId: result.paymentId, provider: 'stripe', clientSecret: result.clientSecret },
        { status: result.outcome === 'created' ? 201 : 200 },
      );
    }

    if (config.provider === 'paypal') {
      const result = await createPaypalOrder(config, {
        businessId: session.businessId,
        invoiceId: invoice!.id,
        amountCents: body.amountCents,
        idempotencyKey: key,
        description: `Invoice ${invoice!.number}`,
      });
      if (result.outcome === 'in_flight') {
        return jsonError('Another payment attempt for this invoice is already in progress — try again shortly', 409);
      }
      if (result.outcome === 'key_reused_for_different_charge') {
        return jsonError('This payment attempt has already been used for a different charge', 409);
      }
      if (result.outcome === 'succeeded') {
        return jsonOk({ outcome: 'succeeded', payment: result.payment });
      }
      if (result.outcome === 'failed') {
        return jsonError(result.errorMessage, 402);
      }
      return jsonOk(
        { paymentId: result.paymentId, provider: 'paypal', orderId: result.orderId },
        { status: result.outcome === 'created' ? 201 : 200 },
      );
    }

    return jsonError('This business is not configured for the intent-based payment flow', 409);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
