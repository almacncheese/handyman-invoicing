import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { assertSameBusiness } from '@/lib/authz';
import { buildInvoiceFromQuote, ConversionError } from '@/lib/quote-invoice';
import type { QuoteLineItem } from '@/lib/calculations';
import { logActivity } from '@/lib/activity';
import { jsonError, jsonOk, errorFromException } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;

    const quote = await prisma.quote.findUnique({
      where: { id },
      include: { invoice: true },
    });
    assertSameBusiness(session, quote);

    // If already invoiced, return existing (idempotent)
    if (quote!.invoice) {
      return jsonOk({ invoice: quote!.invoice, quote, already: true });
    }

    // Allow convert when accepted, or when signature exists even if status lagged
    let statusForConvert = quote!.status;
    if (quote!.acceptedAt && statusForConvert !== 'accepted' && statusForConvert !== 'invoiced') {
      await prisma.quote.update({
        where: { id },
        data: { status: 'accepted' },
      });
      statusForConvert = 'accepted';
    }

    let draft;
    try {
      draft = buildInvoiceFromQuote({
        id: quote!.id,
        status: statusForConvert as never,
        lineItems: quote!.lineItems as QuoteLineItem[],
        taxPercent: quote!.taxPercent,
        depositPercent: quote!.depositPercent,
        invoiceId: null,
      });
    } catch (e) {
      if (e instanceof ConversionError) {
        return jsonError(e.message, e.code === 'ALREADY_INVOICED' ? 409 : 422, {
          code: e.code,
        });
      }
      throw e;
    }

    // Unique invoice number under concurrency: max existing + 1 in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Re-check invoice inside txn
      const existing = await tx.invoice.findUnique({ where: { quoteId: quote!.id } });
      if (existing) {
        const q = await tx.quote.findUniqueOrThrow({ where: { id: quote!.id } });
        return { invoice: existing, quote: q, already: true as const };
      }

      const last = await tx.invoice.findFirst({
        where: { businessId: session.businessId },
        orderBy: { createdAt: 'desc' },
        select: { number: true },
      });
      let seq = 1;
      if (last?.number) {
        const m = last.number.match(/(\d+)$/);
        if (m) seq = parseInt(m[1], 10) + 1;
      }
      const number = `INV-${String(seq).padStart(5, '0')}`;

      const invoice = await tx.invoice.create({
        data: {
          businessId: session.businessId,
          quoteId: quote!.id,
          number,
          status: 'open',
          lineItems: draft.lineItems as unknown as Prisma.InputJsonValue,
          subtotalCents: draft.subtotalCents,
          taxCents: draft.taxCents,
          totalCents: draft.totalCents,
          depositCents: draft.depositCents,
          amountDueCents: draft.amountDueCents,
        },
      });
      const updatedQuote = await tx.quote.update({
        where: { id: quote!.id },
        data: { status: 'invoiced' },
      });
      return { invoice, quote: updatedQuote, already: false as const };
    });

    if (!result.already) {
      await logActivity({
        businessId: session.businessId,
        quoteId: quote!.id,
        invoiceId: result.invoice.id,
        actorType: 'user',
        actorName: session.email,
        action: 'invoiced',
        message: `Converted to invoice ${result.invoice.number}`,
      });
    }

    return jsonOk(result, { status: result.already ? 200 : 201 });
  } catch (e) {
    return errorFromException(e);
  }
}
