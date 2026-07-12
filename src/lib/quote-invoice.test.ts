import { describe, it, expect } from 'vitest';
import { buildInvoiceFromQuote, ConversionError } from './quote-invoice';

const baseLines = [
  { type: 'material' as const, costCents: 10000, marginPercent: 20 },
  { type: 'labor' as const, hours: 4, rateCents: 5000 },
];

describe('buildInvoiceFromQuote', () => {
  it('builds invoice with recomputed totals from accepted quote', () => {
    const inv = buildInvoiceFromQuote({
      id: 'q1',
      status: 'accepted',
      lineItems: baseLines,
      taxPercent: 0,
      depositPercent: 30,
    });
    expect(inv.totalCents).toBe(32000);
    expect(inv.depositCents).toBe(9600);
    expect(inv.quoteId).toBe('q1');
  });

  it('rejects non-accepted quotes', () => {
    expect(() =>
      buildInvoiceFromQuote({
        id: 'q1',
        status: 'sent',
        lineItems: baseLines,
        taxPercent: 0,
        depositPercent: 0,
      }),
    ).toThrow(ConversionError);
  });

  it('rejects already invoiced', () => {
    expect(() =>
      buildInvoiceFromQuote({
        id: 'q1',
        status: 'accepted',
        lineItems: baseLines,
        taxPercent: 0,
        depositPercent: 0,
        invoiceId: 'inv1',
      }),
    ).toThrow(/already converted/);
  });

  it('rejects void even if caller forgot to gate (status is sole authority)', () => {
    expect(() =>
      buildInvoiceFromQuote({
        id: 'q1',
        status: 'void',
        lineItems: baseLines,
        taxPercent: 0,
        depositPercent: 0,
      }),
    ).toThrow(ConversionError);
  });
});
