import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTxInvoiceFindUnique = vi.fn();
const mockTxInvoiceCount = vi.fn();
const mockTxInvoiceCreate = vi.fn();
const mockTxQuoteUpdate = vi.fn();
const mockQueryRaw = vi.fn();
const mockLogActivity = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: async (cb: (tx: unknown) => unknown) =>
      cb({
        $queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
        invoice: {
          findUnique: (...a: unknown[]) => mockTxInvoiceFindUnique(...a),
          count: (...a: unknown[]) => mockTxInvoiceCount(...a),
          create: (...a: unknown[]) => mockTxInvoiceCreate(...a),
        },
        quote: { update: (...a: unknown[]) => mockTxQuoteUpdate(...a) },
      }),
  },
}));
vi.mock('@/lib/activity', () => ({ logActivity: (...a: unknown[]) => mockLogActivity(...a) }));

import { buildInvoiceFromQuote, ConversionError, resolveInvoiceForPayment } from './quote-invoice';

const baseQuote = {
  id: 'q1',
  businessId: 'biz_1',
  number: 'EST-0001',
  status: 'accepted' as const,
  lineItems: [{ type: 'material' as const, costCents: 10000, marginPercent: 20 }],
  taxPercent: 0,
  depositPercent: 30,
  invoice: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockQueryRaw.mockResolvedValue(undefined);
});

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

describe('resolveInvoiceForPayment', () => {
  it('returns the existing invoice directly when one already exists', async () => {
    const result = await resolveInvoiceForPayment({
      ...baseQuote,
      invoice: { id: 'inv_1', status: 'open', amountDueCents: 7000 },
    });
    expect(result).toEqual({ outcome: 'ready', invoiceId: 'inv_1', amountDueCents: 7000 });
    expect(mockTxInvoiceCreate).not.toHaveBeenCalled();
  });

  it('reports void when the existing invoice is void', async () => {
    const result = await resolveInvoiceForPayment({
      ...baseQuote,
      invoice: { id: 'inv_1', status: 'void', amountDueCents: 7000 },
    });
    expect(result).toEqual({ outcome: 'void' });
  });

  it('reports not_ready when the quote has no invoice and cannot yet be converted', async () => {
    const result = await resolveInvoiceForPayment({ ...baseQuote, status: 'sent' });
    expect(result).toEqual({ outcome: 'not_ready' });
    expect(mockTxInvoiceCreate).not.toHaveBeenCalled();
  });

  it('lazily converts an accepted quote with no invoice yet, logging activity', async () => {
    mockTxInvoiceFindUnique.mockResolvedValue(null);
    mockTxInvoiceCount.mockResolvedValue(4);
    mockTxInvoiceCreate.mockResolvedValue({ id: 'inv_new', number: 'INV-00005', amountDueCents: 10000 });

    const result = await resolveInvoiceForPayment(baseQuote);

    expect(mockTxInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quoteId: 'q1', number: 'INV-00005', businessId: 'biz_1' }) }),
    );
    expect(mockTxQuoteUpdate).toHaveBeenCalledWith({ where: { id: 'q1' }, data: { status: 'invoiced' } });
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ action: 'invoiced', quoteId: 'q1' }));
    expect(result).toEqual({ outcome: 'ready', invoiceId: 'inv_new', amountDueCents: 10000 });
  });

  it('does not re-convert when a concurrent request already created the invoice inside the transaction', async () => {
    mockTxInvoiceFindUnique.mockResolvedValue({ id: 'inv_existing', number: 'INV-00002', amountDueCents: 5000 });

    const result = await resolveInvoiceForPayment(baseQuote);

    expect(mockTxInvoiceCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: 'ready', invoiceId: 'inv_existing', amountDueCents: 5000 });
  });
});
