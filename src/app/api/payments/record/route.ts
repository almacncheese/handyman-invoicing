import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { assertSameBusiness } from '@/lib/authz';
import { canTransition, type QuoteStatus } from '@/lib/quote-status';
import { logActivity } from '@/lib/activity';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

/**
 * Manual payment bookkeeping only (no card processor).
 * Idempotency key is required so double-clicks / retries cannot double-apply.
 */
const schema = z.object({
  invoiceId: z.string().min(1),
  amountCents: z.number().int().positive(),
  method: z.enum(['cash', 'check', 'zelle', 'cashapp', 'venmo', 'other']),
  note: z.string().max(500).optional(),
  /** Client-generated; stable across retries of the same user action */
  idempotencyKey: z.string().min(12).max(100),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = schema.parse(await req.json());
    const key = body.idempotencyKey.trim();

    const invoice = await prisma.invoice.findUnique({
      where: { id: body.invoiceId },
      include: { quote: true },
    });
    assertSameBusiness(session, invoice);

    if (invoice!.status === 'void') {
      return jsonError('Invoice is void', 409);
    }

    // Fast path replay before txn
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      if (existing.businessId !== session.businessId) return jsonError('Not found', 404);
      return jsonOk({ payment: existing, replayed: true });
    }

    let payment;
    try {
      payment = await prisma.$transaction(async (tx) => {
        // Row lock so concurrent records cannot desync ledger vs balance
        await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${invoice!.id} FOR UPDATE`;

        const again = await tx.payment.findUnique({ where: { idempotencyKey: key } });
        if (again) {
          if (again.businessId !== session.businessId) {
            throw Object.assign(new Error('Not found'), { status: 404 });
          }
          return { payment: again, replayed: true as const };
        }

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

        // Atomic ledger math from locked row (not a second racey read of a stale copy)
        const newPaid = fresh.amountPaidCents + body.amountCents;
        const fullyPaid = newPaid >= fresh.totalCents;
        await tx.invoice.update({
          where: { id: fresh.id },
          data: {
            amountPaidCents: { increment: body.amountCents },
            amountDueCents: Math.max(0, fresh.totalCents - newPaid),
            status: fullyPaid ? 'paid' : 'partial',
          },
        });
        if (fullyPaid) {
          const qStatus = (await tx.quote.findUnique({
            where: { id: fresh.quoteId },
            select: { status: true },
          }))!.status as QuoteStatus;
          if (canTransition(qStatus, 'paid') || qStatus === 'invoiced' || qStatus === 'accepted') {
            await tx.quote.update({
              where: { id: fresh.quoteId },
              data: { status: 'paid' },
            });
          }
        }
        return { payment: p, replayed: false as const };
      });
    } catch (e) {
      // Unique idempotency race: other request won — return their row
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const replay = await prisma.payment.findUnique({ where: { idempotencyKey: key } });
        if (replay && replay.businessId === session.businessId) {
          return jsonOk({ payment: replay, replayed: true });
        }
      }
      throw e;
    }

    if (payment.replayed) {
      return jsonOk({ payment: payment.payment, replayed: true });
    }

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

    return jsonOk({ payment: payment.payment, replayed: false }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return jsonError(e.errors[0]?.message || 'Invalid input', 422);
    }
    const status = (e as { status?: number })?.status;
    if (status === 404 || status === 409 || status === 422) {
      return jsonError((e as Error).message, status);
    }
    return errorFromException(e);
  }
}
