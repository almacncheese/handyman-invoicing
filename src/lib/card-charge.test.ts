import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mockPaymentCreate = vi.fn();
const mockPaymentUpdateMany = vi.fn();
const mockPaymentUpdate = vi.fn();
const mockPaymentFindUnique = vi.fn();
const mockInvoiceFindUniqueOrThrow = vi.fn();
const mockInvoiceUpdate = vi.fn();
const mockQuoteFindUniqueOrThrow = vi.fn();
const mockQuoteUpdate = vi.fn();
const mockQueryRaw = vi.fn();
const mockCharge = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    payment: {
      create: (...a: unknown[]) => mockPaymentCreate(...a),
      updateMany: (...a: unknown[]) => mockPaymentUpdateMany(...a),
      update: (...a: unknown[]) => mockPaymentUpdate(...a),
      findUnique: (...a: unknown[]) => mockPaymentFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => mockPaymentFindUnique(...a),
    },
    $transaction: async (cb: (tx: unknown) => unknown) =>
      cb({
        $queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
        payment: {
          update: (...a: unknown[]) => mockPaymentUpdate(...a),
        },
        invoice: {
          findUniqueOrThrow: (...a: unknown[]) => mockInvoiceFindUniqueOrThrow(...a),
          update: (...a: unknown[]) => mockInvoiceUpdate(...a),
        },
        quote: {
          findUniqueOrThrow: (...a: unknown[]) => mockQuoteFindUniqueOrThrow(...a),
          update: (...a: unknown[]) => mockQuoteUpdate(...a),
        },
      }),
  },
}));
vi.mock('@/lib/providers/factory', () => ({
  createOneShotProvider: () => ({ charge: (...a: unknown[]) => mockCharge(...a) }),
}));

import { processCardCharge, claimStatusTransition, settleCharge } from './card-charge';

const baseParams = {
  config: { provider: 'authorize_net' as const, sandbox: true, apiLoginId: 'login', clientKey: 'ck', transactionKey: 'tk' },
  businessId: 'biz_1',
  invoiceId: 'inv_1',
  amountCents: 4000,
  idempotencyKey: 'card_key_1234567890',
  billTo: { firstName: 'Jordan', lastName: 'Homeowner' },
  description: 'Deposit for EST-0001',
  metadata: { opaqueDataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT', opaqueDataValue: 'opaque-token-abc' },
};

const freshInvoice = { id: 'inv_1', quoteId: 'q1', amountPaidCents: 0, totalCents: 4000, status: 'open' };

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoiceFindUniqueOrThrow.mockResolvedValue(freshInvoice);
  mockQuoteFindUniqueOrThrow.mockResolvedValue({ id: 'q1', status: 'invoiced' });
  mockQueryRaw.mockResolvedValue(undefined);
});

describe('processCardCharge — fresh claim', () => {
  it('charges and credits the invoice in full when the card is approved for the full balance', async () => {
    mockPaymentCreate.mockResolvedValue({
      idempotencyKey: baseParams.idempotencyKey,
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'processing',
      provider: 'authorize_net',
      transactionId: null,
    });
    mockCharge.mockResolvedValue({ success: true, provider: 'authorize_net', transactionId: 'tx1', authCode: 'OK1' });
    mockPaymentUpdate.mockResolvedValue({});
    mockPaymentFindUnique.mockResolvedValue({ idempotencyKey: baseParams.idempotencyKey, status: 'succeeded' });

    const result = await processCardCharge(baseParams);

    expect(mockCharge).toHaveBeenCalledTimes(1);
    expect(mockInvoiceUpdate).toHaveBeenCalledWith({
      where: { id: 'inv_1' },
      data: { amountPaidCents: 4000, amountDueCents: 0, status: 'paid' },
    });
    expect(mockQuoteUpdate).toHaveBeenCalledWith({ where: { id: 'q1' }, data: { status: 'paid' } });
    expect(result.outcome).toBe('succeeded');
  });

  it('credits the invoice as partial and does not flip the quote to paid on a partial payment', async () => {
    mockPaymentCreate.mockResolvedValue({
      idempotencyKey: baseParams.idempotencyKey,
      invoiceId: 'inv_1',
      amountCents: 2000,
      status: 'processing',
      provider: 'authorize_net',
    });
    mockInvoiceFindUniqueOrThrow.mockResolvedValue({ ...freshInvoice, totalCents: 10000 });
    mockCharge.mockResolvedValue({ success: true, provider: 'authorize_net', transactionId: 'tx2' });
    mockPaymentFindUnique.mockResolvedValue({ idempotencyKey: baseParams.idempotencyKey, status: 'succeeded' });

    await processCardCharge({ ...baseParams, amountCents: 2000 });

    expect(mockInvoiceUpdate).toHaveBeenCalledWith({
      where: { id: 'inv_1' },
      data: { amountPaidCents: 2000, amountDueCents: 8000, status: 'partial' },
    });
    expect(mockQuoteUpdate).not.toHaveBeenCalled();
  });

  it('marks the payment failed and does NOT credit the invoice when the card is declined', async () => {
    mockPaymentCreate.mockResolvedValue({
      idempotencyKey: baseParams.idempotencyKey,
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'processing',
      provider: 'authorize_net',
    });
    mockCharge.mockResolvedValue({
      success: false,
      provider: 'authorize_net',
      errorCode: 'declined',
      errorMessage: 'This transaction has been declined.',
    });
    mockPaymentFindUnique.mockResolvedValue({ idempotencyKey: baseParams.idempotencyKey, status: 'failed' });

    const result = await processCardCharge(baseParams);

    expect(mockInvoiceUpdate).not.toHaveBeenCalled();
    expect(mockPaymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }),
    );
    expect(result.outcome).toBe('failed');
  });
});

describe('processCardCharge — idempotent replay', () => {
  it('returns the existing result and does not call the provider again when the same key already succeeded', async () => {
    mockPaymentCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    mockPaymentUpdateMany.mockResolvedValue({ count: 0 }); // not retryable — already succeeded
    mockPaymentFindUnique.mockResolvedValue({
      idempotencyKey: baseParams.idempotencyKey,
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'succeeded',
      provider: 'authorize_net',
      transactionId: 'tx-old',
    });

    const result = await processCardCharge(baseParams);

    expect(mockCharge).not.toHaveBeenCalled();
    expect(result.outcome).toBe('succeeded');
  });

  it('reclaims and retries when the same key previously failed', async () => {
    mockPaymentCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 }); // reclaimed from 'failed'
    mockPaymentFindUnique.mockResolvedValue({
      idempotencyKey: baseParams.idempotencyKey,
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'processing',
      provider: 'authorize_net',
    });
    mockCharge.mockResolvedValue({ success: true, provider: 'authorize_net', transactionId: 'tx-retry' });

    const result = await processCardCharge(baseParams);

    expect(mockCharge).toHaveBeenCalledTimes(1);
    expect(result.outcome).toBe('succeeded');
  });

  it('returns in_flight and never calls the provider when another request is actively processing the same key', async () => {
    mockPaymentCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    mockPaymentUpdateMany.mockResolvedValue({ count: 0 }); // still 'processing' elsewhere, not reclaimed
    mockPaymentFindUnique.mockResolvedValue({
      idempotencyKey: baseParams.idempotencyKey,
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'processing',
      provider: 'authorize_net',
    });

    const result = await processCardCharge(baseParams);

    expect(mockCharge).not.toHaveBeenCalled();
    expect(result.outcome).toBe('in_flight');
  });

  it('rejects reusing the same idempotency key for a different invoice or amount, without charging', async () => {
    mockPaymentCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    mockPaymentUpdateMany.mockResolvedValue({ count: 0 });
    mockPaymentFindUnique.mockResolvedValue({
      idempotencyKey: baseParams.idempotencyKey,
      invoiceId: 'inv_DIFFERENT',
      amountCents: 999,
      status: 'succeeded',
      provider: 'authorize_net',
    });

    const result = await processCardCharge(baseParams);

    expect(mockCharge).not.toHaveBeenCalled();
    expect(result.outcome).toBe('key_reused_for_different_charge');
  });
});

describe('claimStatusTransition', () => {
  it('claims fresh when the create succeeds', async () => {
    mockPaymentCreate.mockResolvedValue({ idempotencyKey: 'k1', status: 'awaiting_confirmation' });

    const { row, claimedByUs } = await claimStatusTransition({
      idempotencyKey: 'k1',
      createData: { idempotencyKey: 'k1', status: 'awaiting_confirmation' } as never,
      reclaimFromStatuses: ['pending', 'failed'],
      reclaimToStatus: 'awaiting_confirmation',
    });

    expect(claimedByUs).toBe(true);
    expect(row).toEqual({ idempotencyKey: 'k1', status: 'awaiting_confirmation' });
    expect(mockPaymentUpdateMany).not.toHaveBeenCalled();
  });

  it('reclaims from an allowed source status into the given target status', async () => {
    mockPaymentCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    mockPaymentFindUnique.mockResolvedValue({ idempotencyKey: 'k1', status: 'awaiting_confirmation' });

    const { row, claimedByUs } = await claimStatusTransition({
      idempotencyKey: 'k1',
      createData: { idempotencyKey: 'k1' } as never,
      reclaimFromStatuses: ['pending', 'failed'],
      reclaimToStatus: 'awaiting_confirmation',
    });

    expect(mockPaymentUpdateMany).toHaveBeenCalledWith({
      where: { idempotencyKey: 'k1', status: { in: ['pending', 'failed'] } },
      data: { status: 'awaiting_confirmation' },
    });
    expect(claimedByUs).toBe(true);
    expect(row.status).toBe('awaiting_confirmation');
  });

  it('does not reclaim when the existing row is not in an allowed source status', async () => {
    mockPaymentCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    mockPaymentUpdateMany.mockResolvedValue({ count: 0 });
    mockPaymentFindUnique.mockResolvedValue({ idempotencyKey: 'k1', status: 'processing' });

    const { claimedByUs } = await claimStatusTransition({
      idempotencyKey: 'k1',
      createData: { idempotencyKey: 'k1' } as never,
      reclaimFromStatuses: ['pending', 'failed'],
      reclaimToStatus: 'awaiting_confirmation',
    });

    expect(claimedByUs).toBe(false);
  });
});

describe('settleCharge', () => {
  it('marks the payment failed and returns success:false without crediting the invoice', async () => {
    mockPaymentUpdate.mockResolvedValue({});

    const result = await settleCharge({
      invoiceId: 'inv_1',
      idempotencyKey: 'k1',
      amountCents: 4000,
      chargeResult: { success: false, provider: 'stripe', errorMessage: 'Card declined' },
    });

    expect(result.success).toBe(false);
    expect(mockPaymentUpdate).toHaveBeenCalledWith({
      where: { idempotencyKey: 'k1' },
      data: { status: 'failed', note: 'Card declined' },
    });
    expect(mockInvoiceUpdate).not.toHaveBeenCalled();
  });

  it('credits the invoice and returns the fresh payment row on success', async () => {
    mockQueryRaw.mockResolvedValue(undefined);
    mockInvoiceFindUniqueOrThrow.mockResolvedValue({ ...freshInvoice });
    mockQuoteFindUniqueOrThrow.mockResolvedValue({ id: 'q1', status: 'invoiced' });
    mockPaymentUpdate.mockResolvedValue({});
    mockPaymentFindUnique.mockResolvedValue({ idempotencyKey: 'k1', status: 'succeeded' });

    const result = await settleCharge({
      invoiceId: 'inv_1',
      idempotencyKey: 'k1',
      amountCents: 4000,
      chargeResult: { success: true, provider: 'stripe', transactionId: 'pi_123' },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.payment).toEqual({ idempotencyKey: 'k1', status: 'succeeded' });
    }
    expect(mockInvoiceUpdate).toHaveBeenCalledWith({
      where: { id: 'inv_1' },
      data: { amountPaidCents: 4000, amountDueCents: 0, status: 'paid' },
    });
    expect(mockQuoteUpdate).toHaveBeenCalledWith({ where: { id: 'q1' }, data: { status: 'paid' } });
  });

  it('does not resurrect a voided invoice ledger, but still records the payment', async () => {
    mockQueryRaw.mockResolvedValue(undefined);
    mockInvoiceFindUniqueOrThrow.mockResolvedValue({ ...freshInvoice, status: 'void' });
    mockPaymentUpdate.mockResolvedValue({});
    mockPaymentFindUnique.mockResolvedValue({ idempotencyKey: 'k1', status: 'succeeded' });

    await settleCharge({
      invoiceId: 'inv_1',
      idempotencyKey: 'k1',
      amountCents: 4000,
      chargeResult: { success: true, provider: 'stripe', transactionId: 'pi_123' },
    });

    expect(mockInvoiceUpdate).not.toHaveBeenCalled();
    expect(mockQuoteUpdate).not.toHaveBeenCalled();
  });
});
