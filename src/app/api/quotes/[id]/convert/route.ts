import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { assertSameBusiness } from '@/lib/authz';
import { buildInvoiceFromQuote, ConversionError } from '@/lib/quote-invoice';
import type { QuoteLineItem } from '@/lib/calculations';
import { canConvertToInvoice, type QuoteStatus } from '@/lib/quote-status';
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

    // Status is the only gate — do NOT heal status from acceptedAt.
    // That path resurrected voided (terminal) quotes into invoices.
    const status = quote!.status as QuoteStatus;
    if (!canConvertToInvoice(status)) {
      return jsonError(
        `Quote must be accepted before invoicing (status=${status})`,
        422,
        { code: 'NOT_ACCEPTED' },
      );
    }

    let draft;
    try {
      draft = buildInvoiceFromQuote({
        id: quote!.id,
        status,
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

    // Unique invoice number under concurrency: lock business row + count
    const result = await prisma.$transaction(async (tx) => {
      // Re-check invoice inside txn
      const existing = await tx.invoice.findUnique({ where: { quoteId: quote!.id } });
      if (existing) {
        const q = await tx.quote.findUniqueOrThrow({ where: { id: quote!.id } });
        return { invoice: existing, quote: q, already: true as const };
      }

      // Serialize invoice number allocation per tenant
      await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${session.businessId} FOR UPDATE`;
      const invCount = await tx.invoice.count({
        where: { businessId: session.businessId },
      });
      const number = `INV-${String(invCount + 1).padStart(5, '0')}`;

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
