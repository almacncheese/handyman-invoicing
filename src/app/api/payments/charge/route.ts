import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { assertSameBusiness } from '@/lib/authz';
import { clientIp } from '@/lib/rate-limit';
import { processCardCharge } from '@/lib/card-charge';
import { loadGatewayConfig } from '@/lib/gateway-config';
import { logActivity } from '@/lib/activity';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

/**
 * Contractor phone-entry card charge (session-gated). Separate entry point
 * from the public customer self-serve route, sharing src/lib/card-charge.ts's
 * claim-then-charge orchestration. One-shot only (Authorize.net / Square) —
 * Stripe/PayPal use the paired /api/payments/intent + /confirm routes since
 * their confirm step is inherently client-driven.
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
  invoiceId: z.string().min(1),
  amountCents: z.number().int().positive(),
  idempotencyKey: z.string().min(12).max(100),
  opaqueData: z
    .object({
      dataDescriptor: z.string().min(1),
      dataValue: z.string().min(1),
    })
    .optional(),
  sourceId: z.string().min(1).optional(),
  billTo: billToSchema,
  customerEmail: z.string().email().optional(),
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
    if (!config || (config.provider !== 'authorize_net' && config.provider !== 'square')) {
      return jsonError('Card charging is not configured for this business', 409);
    }

    let metadata: Record<string, string>;
    if (config.provider === 'authorize_net') {
      if (!body.opaqueData) return jsonError('Missing card payment token', 422);
      metadata = {
        opaqueDataDescriptor: body.opaqueData.dataDescriptor,
        opaqueDataValue: body.opaqueData.dataValue,
        invoiceNumber: invoice!.number,
      };
    } else {
      if (!body.sourceId) return jsonError('Missing card payment token', 422);
      metadata = { sourceId: body.sourceId };
    }

    const result = await processCardCharge({
      config,
      businessId: session.businessId,
      invoiceId: invoice!.id,
      amountCents: body.amountCents,
      idempotencyKey: key,
      billTo: body.billTo,
      customerEmail: body.customerEmail,
      customerIp: clientIp(req),
      description: `Invoice ${invoice!.number}`,
      metadata,
    });

    if (result.outcome === 'in_flight') {
      return jsonError('Another charge attempt for this payment is already in progress — try again shortly', 409);
    }
    if (result.outcome === 'key_reused_for_different_charge') {
      return jsonError('This payment attempt has already been used for a different charge', 409);
    }
    if (result.outcome === 'failed') {
      return jsonError(result.errorMessage, 402);
    }

    await logActivity({
      businessId: session.businessId,
      quoteId: invoice!.quoteId,
      invoiceId: invoice!.id,
      actorType: 'user',
      actorName: session.email,
      action: 'payment_recorded',
      message: 'Recorded card payment',
      meta: { amountCents: body.amountCents, method: 'card' },
    });

    return jsonOk({ payment: result.payment, replayed: false }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
