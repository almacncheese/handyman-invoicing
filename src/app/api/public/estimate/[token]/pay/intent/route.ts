import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isValidPublicToken } from '@/lib/authz';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { resolveInvoiceForPayment, ConversionError } from '@/lib/quote-invoice';
import type { QuoteStatus } from '@/lib/quote-status';
import type { QuoteLineItem } from '@/lib/calculations';
import { loadGatewayConfig } from '@/lib/gateway-config';
import { createStripeIntent } from '@/lib/providers/stripe-charge';
import { createPaypalOrder } from '@/lib/providers/paypal-charge';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

/**
 * Public customer self-serve — phase 1 of the two/three-phase Stripe/PayPal
 * flows (Authorize.net/Square are one-shot and use pay/route.ts directly).
 * Never accepts a client-supplied invoiceId or amountCents, same as
 * pay/route.ts; shares its lazy quote-to-invoice conversion via
 * resolveInvoiceForPayment() so the two entry points can't drift.
 */
const schema = z.object({
  amountChoice: z.enum(['deposit', 'balance']),
  idempotencyKey: z.string().min(12).max(100),
});

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const limited = rateLimit({ key: `public-pay-intent:${clientIp(req)}`, limit: 20, windowMs: 15 * 60_000 });
    if (!limited.ok) {
      return jsonError('Too many attempts — try again later', 429);
    }

    const { token } = await ctx.params;
    if (!isValidPublicToken(token)) {
      return jsonError('Not found', 404);
    }

    const body = schema.parse(await req.json());
    const key = body.idempotencyKey.trim();

    const quote = await prisma.quote.findUnique({
      where: { publicToken: token },
      include: { invoice: true },
    });
    if (!quote || quote.status === 'void') {
      return jsonError('Not found', 404);
    }

    const resolved = await resolveInvoiceForPayment({
      id: quote.id,
      businessId: quote.businessId,
      number: quote.number,
      status: quote.status as QuoteStatus,
      lineItems: quote.lineItems as QuoteLineItem[],
      taxPercent: quote.taxPercent,
      depositPercent: quote.depositPercent,
      invoice: quote.invoice,
    });
    if (resolved.outcome === 'void') {
      return jsonError('This invoice is void', 409);
    }
    if (resolved.outcome === 'not_ready') {
      return jsonError('This estimate is not ready for payment yet', 409);
    }
    const { invoiceId, amountDueCents } = resolved;

    if (amountDueCents <= 0) {
      return jsonError('This invoice has no balance remaining', 409);
    }

    const amountCents =
      body.amountChoice === 'deposit' ? Math.min(quote.depositCents, amountDueCents) : amountDueCents;
    if (amountCents <= 0) {
      return jsonError('Nothing to pay', 409);
    }

    const config = await loadGatewayConfig(quote.businessId);
    if (!config) {
      return jsonError('Card charging is not configured for this business', 409);
    }

    if (config.provider === 'stripe') {
      const result = await createStripeIntent(config, {
        businessId: quote.businessId,
        invoiceId,
        amountCents,
        idempotencyKey: key,
        description: `Estimate ${quote.number || quote.id}`,
      });
      if (result.outcome === 'in_flight') {
        return jsonError('Another payment attempt is already in progress — try again shortly', 409);
      }
      if (result.outcome === 'key_reused_for_different_charge') {
        return jsonError('This payment attempt has already been used', 409);
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
        businessId: quote.businessId,
        invoiceId,
        amountCents,
        idempotencyKey: key,
        description: `Estimate ${quote.number || quote.id}`,
      });
      if (result.outcome === 'in_flight') {
        return jsonError('Another payment attempt is already in progress — try again shortly', 409);
      }
      if (result.outcome === 'key_reused_for_different_charge') {
        return jsonError('This payment attempt has already been used', 409);
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
    if (e instanceof ConversionError) {
      return jsonError(e.message, 422, { code: e.code });
    }
    return errorFromException(e);
  }
}
