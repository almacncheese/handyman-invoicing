/**
 * Quote → Invoice conversion invariants.
 */

import type { QuoteLineItem } from './calculations';
import { calculateQuoteTotal } from './calculations';
import type { QuoteStatus } from './quote-status';

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
