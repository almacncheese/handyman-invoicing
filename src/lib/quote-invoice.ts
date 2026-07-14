/**
 * Quote → Invoice conversion invariants.
 */

import { Prisma } from '@prisma/client';
import { prisma } from './db';
import { logActivity } from './activity';
import type { QuoteLineItem } from './calculations';
import { calculateQuoteTotal } from './calculations';
import { canConvertToInvoice, type QuoteStatus } from './quote-status';

export type QuoteSnapshot = {
  id: string;
  status: QuoteStatus;
  lineItems: QuoteLineItem[];
  taxPercent: number;
  depositPercent: number;
  /** Already linked invoice? */
  invoiceId?: string | null;
};

export type InvoiceDraft = {
  quoteId: string;
  lineItems: QuoteLineItem[];
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
  amountDueCents: number;
};

export class ConversionError extends Error {
  constructor(
    message: string,
    public code: 'NOT_ACCEPTED' | 'ALREADY_INVOICED' | 'EMPTY',
  ) {
    super(message);
    this.name = 'ConversionError';
  }
}

/**
 * Build an invoice draft from an accepted quote.
 * Totals are recomputed — never trust stored denormalized fields alone.
 */
export function buildInvoiceFromQuote(quote: QuoteSnapshot): InvoiceDraft {
  if (quote.invoiceId) {
    throw new ConversionError('Quote already converted to invoice', 'ALREADY_INVOICED');
  }
  if (quote.status !== 'accepted') {
    throw new ConversionError(
      `Quote must be accepted before invoicing (status=${quote.status})`,
      'NOT_ACCEPTED',
    );
  }
  if (!quote.lineItems?.length) {
    throw new ConversionError('Quote has no line items', 'EMPTY');
  }

  const totals = calculateQuoteTotal(quote.lineItems, {
    taxPercent: quote.taxPercent,
    depositPercent: quote.depositPercent,
  });

  return {
    quoteId: quote.id,
    lineItems: quote.lineItems,
    subtotalCents: totals.subtotalCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    depositCents: totals.depositCents,
    amountDueCents: totals.totalCents,
  };
}

export type ResolveInvoiceOutcome =
  | { outcome: 'ready'; invoiceId: string; amountDueCents: number }
  | { outcome: 'void' }
  | { outcome: 'not_ready' };

/**
 * DB-wiring counterpart to buildInvoiceFromQuote — used by both public
 * payment routes (pay/route.ts, pay/intent/route.ts) so the lazy
 * quote-to-invoice conversion can't drift between the two entry points.
 * Reuses convert/route.ts's own lock + numbering scheme; that route itself
 * is untouched.
 */
export async function resolveInvoiceForPayment(quote: {
  id: string;
  businessId: string;
  number: string | null;
  status: QuoteStatus;
  lineItems: QuoteLineItem[];
  taxPercent: number;
  depositPercent: number;
  invoice: { id: string; status: string; amountDueCents: number } | null;
}): Promise<ResolveInvoiceOutcome> {
  if (quote.invoice) {
    if (quote.invoice.status === 'void') {
      return { outcome: 'void' };
    }
    return { outcome: 'ready', invoiceId: quote.invoice.id, amountDueCents: quote.invoice.amountDueCents };
  }

  if (!canConvertToInvoice(quote.status)) {
    return { outcome: 'not_ready' };
  }

  const draft = buildInvoiceFromQuote({
    id: quote.id,
    status: quote.status,
    lineItems: quote.lineItems,
    taxPercent: quote.taxPercent,
    depositPercent: quote.depositPercent,
    invoiceId: null,
  });

  const invoice = await prisma.$transaction(async (tx) => {
    // Idempotent — a concurrent request may have already converted this quote.
    const existing = await tx.invoice.findUnique({ where: { quoteId: quote.id } });
    if (existing) return existing;

    // Same lock + counting scheme as convert/route.ts's own numbering.
    await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${quote.businessId} FOR UPDATE`;
    const invCount = await tx.invoice.count({ where: { businessId: quote.businessId } });
    const number = `INV-${String(invCount + 1).padStart(5, '0')}`;

    const created = await tx.invoice.create({
      data: {
        businessId: quote.businessId,
        quoteId: quote.id,
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
    await tx.quote.update({ where: { id: quote.id }, data: { status: 'invoiced' } });
    return created;
  });

  await logActivity({
    businessId: quote.businessId,
    quoteId: quote.id,
    invoiceId: invoice.id,
    actorType: 'system',
    action: 'invoiced',
    message: `Converted to invoice ${invoice.number} for customer payment`,
  });

  return { outcome: 'ready', invoiceId: invoice.id, amountDueCents: invoice.amountDueCents };
}
