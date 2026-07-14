import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { isValidPublicToken } from '@/lib/authz';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { resolveInvoiceForPayment, ConversionError } from '@/lib/quote-invoice';
import type { QuoteStatus } from '@/lib/quote-status';
import type { QuoteLineItem } from '@/lib/calculations';
import { processCardCharge } from '@/lib/card-charge';
import { loadGatewayConfig } from '@/lib/gateway-config';
import { logActivity } from '@/lib/activity';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

/**
 * Public customer self-serve card payment. Never accepts a client-supplied
 * invoiceId or amountCents — everything is resolved server-side from the
 * token, unlike the session-gated /api/payments/charge route where tenant
 * scoping makes client-supplied values safe.
 *
 * If the estimate was accepted but the contractor hasn't converted it to an
 * invoice yet, this lazily converts it via resolveInvoiceForPayment() (shared
 * with pay/intent/route.ts so the two entry points can't drift) rather than
 * making the customer wait — accept/route.ts and convert/route.ts themselves
 * are untouched.
 */
const billToSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  address: z.string().max(60).optional(),
  city: z.string().max(40).optional(),
  state: z.string().max(40).optional(),
  zip: z.string().max(20).optional(),
  country: z.string().max(60).optional(),
});

const schema = z.object({
  amountChoice: z.enum(['deposit', 'balance']),
  idempotencyKey: z.string().min(12).max(100),
  opaqueData: z
    .object({
      dataDescriptor: z.string().min(1),
      dataValue: z.string().min(1),
    })
    .optional(),
  sourceId: z.string().min(1).optional(),
  billTo: billToSchema,
});

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const limited = rateLimit({ key: `public-pay:${clientIp(req)}`, limit: 20, windowMs: 15 * 60_000 });
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
    if (!config || (config.provider !== 'authorize_net' && config.provider !== 'square')) {
      return jsonError('Card charging is not configured for this business', 409);
    }

    let metadata: Record<string, string>;
    if (config.provider === 'authorize_net') {
      if (!body.opaqueData) return jsonError('Missing card payment token', 422);
      metadata = {
        opaqueDataDescriptor: body.opaqueData.dataDescriptor,
        opaqueDataValue: body.opaqueData.dataValue,
        invoiceNumber: invoiceId,
      };
    } else {
      if (!body.sourceId) return jsonError('Missing card payment token', 422);
      metadata = { sourceId: body.sourceId };
    }

    const result = await processCardCharge({
      config,
      businessId: quote.businessId,
      invoiceId,
      amountCents,
      idempotencyKey: key,
      billTo: body.billTo,
      customerIp: clientIp(req),
      description: `Estimate ${quote.number || quote.id}`,
      metadata,
    });

    if (result.outcome === 'in_flight') {
      return jsonError('Another payment attempt is already in progress — try again shortly', 409);
    }
    if (result.outcome === 'key_reused_for_different_charge') {
      return jsonError('This payment attempt has already been used', 409);
    }
    if (result.outcome === 'failed') {
      return jsonError(result.errorMessage, 402);
    }

    await logActivity({
      businessId: quote.businessId,
      quoteId: quote.id,
      invoiceId,
      actorType: 'customer',
      action: 'payment_recorded',
      message: 'Customer paid by card',
      meta: { amountCents, method: 'card' },
    });

    return jsonOk({ payment: result.payment }, { status: 201 });
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
