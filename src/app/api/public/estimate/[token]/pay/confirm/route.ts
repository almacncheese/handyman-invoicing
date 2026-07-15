import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isValidPublicToken } from '@/lib/authz';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { loadGatewayConfig } from '@/lib/gateway-config';
import { confirmStripeIntent, cancelStripeIntent } from '@/lib/providers/stripe-charge';
import { capturePaypalOrder, cancelPaypalOrder } from '@/lib/providers/paypal-charge';
import { logActivity } from '@/lib/activity';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

/**
 * Public customer self-serve — phase 2 of the two/three-phase Stripe/PayPal
 * flows. businessId/invoiceId are re-derived from the Payment row itself
 * (scoped to this token's own quote), never trusted from the client — the
 * client only ever echoes back our own server-generated paymentId.
 */
const schema = z.object({
  paymentId: z.string().min(1),
  action: z.enum(['cancel']).optional(),
});

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const limited = rateLimit({ key: `public-pay-confirm:${clientIp(req)}`, limit: 30, windowMs: 15 * 60_000 });
    if (!limited.ok) {
      return jsonError('Too many attempts — try again later', 429);
    }

    const { token } = await ctx.params;
    if (!isValidPublicToken(token)) {
      return jsonError('Not found', 404);
    }

    const body = schema.parse(await req.json());

    const quote = await prisma.quote.findUnique({
      where: { publicToken: token },
      select: { id: true, businessId: true, invoice: { select: { id: true } } },
    });
    if (!quote) {
      return jsonError('Not found', 404);
    }

    const row = await prisma.payment.findUnique({ where: { id: body.paymentId } });
    // Scope to this estimate's invoice — businessId alone would let one public
    // token confirm/cancel another estimate's payment for the same contractor.
    if (
      !row ||
      row.businessId !== quote.businessId ||
      !quote.invoice ||
      row.invoiceId !== quote.invoice.id
    ) {
      return jsonError('Not found', 404);
    }

    const config = await loadGatewayConfig(quote.businessId);
    if (!config || config.provider !== row.provider) {
      return jsonError('Payment gateway configuration has changed since this payment was started', 409);
    }

    const scoped = { businessId: quote.businessId, invoiceId: row.invoiceId, paymentId: body.paymentId };

    if (body.action === 'cancel') {
      if (config.provider === 'stripe') {
        return jsonOk(await cancelStripeIntent(scoped, config));
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
        businessId: quote.businessId,
        invoiceId: row.invoiceId,
        actorType: 'customer',
        action: 'payment_recorded',
        message: 'Customer paid by card',
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
        businessId: quote.businessId,
        invoiceId: row.invoiceId,
        actorType: 'customer',
        action: 'payment_recorded',
        message: 'Customer paid by card',
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
