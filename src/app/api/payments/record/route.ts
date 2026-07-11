import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { assertSameBusiness } from '@/lib/authz';
import { generatePublicToken } from '@/lib/tokens';
import { logActivity } from '@/lib/activity';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

/**
 * Manual payment bookkeeping only (no card processor).
 */
const schema = z.object({
  invoiceId: z.string().min(1),
  amountCents: z.number().int().positive(),
  method: z.enum(['cash', 'check', 'zelle', 'cashapp', 'venmo', 'other']),
  note: z.string().max(500).optional(),
  idempotencyKey: z.string().min(8).max(100).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());
    const key = body.idempotencyKey || `manual_${body.invoiceId}_${generatePublicToken(8)}`;

    const invoice = await prisma.invoice.findUnique({
      where: { id: body.invoiceId },
      include: { quote: true },
    });
    assertSameBusiness(session, invoice);

    if (invoice!.status === 'void') {
      return jsonError('Invoice is void', 409);
    }

    const existing = await prisma.payment.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      if (existing.businessId !== session.businessId) return jsonError('Not found', 404);
      return jsonOk({ payment: existing, replayed: true });
    }

    const payment = await prisma.$transaction(async (tx) => {
      // Re-read under transaction to avoid concurrent double-pay overbalance
      const fresh = await tx.invoice.findUnique({ where: { id: invoice!.id } });
      if (!fresh || fresh.businessId !== session.businessId) {
        throw Object.assign(new Error('Not found'), { status: 404 });
      }
      if (fresh.status === 'void') {
        throw Object.assign(new Error('Invoice is void'), { status: 409 });
      }
      if (body.amountCents > fresh.amountDueCents + 1) {
        throw Object.assign(
          new Error(`Amount exceeds balance due (${fresh.amountDueCents} cents)`),
          { status: 422 },
        );
      }

      const p = await tx.payment.create({
        data: {
          businessId: session.businessId,
          invoiceId: fresh.id,
          amountCents: body.amountCents,
          status: 'succeeded',
          method: body.method,
          provider: 'manual',
          idempotencyKey: key,
          note: body.note || null,
          processedAt: new Date(),
          transactionId: `manual_${key.slice(0, 20)}`,
        },
      });

      const newPaid = fresh.amountPaidCents + body.amountCents;
      const fullyPaid = newPaid >= fresh.totalCents;
      await tx.invoice.update({
        where: { id: fresh.id },
        data: {
          amountPaidCents: newPaid,
          amountDueCents: Math.max(0, fresh.totalCents - newPaid),
          status: fullyPaid ? 'paid' : 'partial',
        },
      });
      if (fullyPaid) {
        await tx.quote.update({
          where: { id: fresh.quoteId },
          data: { status: 'paid' },
        });
      }
      return p;
    });

    await logActivity({
      businessId: session.businessId,
      quoteId: invoice!.quoteId,
      invoiceId: invoice!.id,
      actorType: 'user',
      actorName: session.email,
      action: 'payment_recorded',
      message: `Recorded ${body.method} payment`,
      meta: { amountCents: body.amountCents, method: body.method },
    });

    return jsonOk({ payment, replayed: false }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    return errorFromException(e);
  }
}
