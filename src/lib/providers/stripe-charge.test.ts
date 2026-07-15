import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mockPaymentCreate = vi.fn();
const mockPaymentUpdateMany = vi.fn();
const mockPaymentUpdate = vi.fn();
const mockPaymentFindUnique = vi.fn();
const mockPaymentFindFirst = vi.fn();
const mockInvoiceFindUniqueOrThrow = vi.fn();
const mockInvoiceUpdate = vi.fn();
const mockQuoteFindUniqueOrThrow = vi.fn();
const mockQuoteUpdate = vi.fn();
const mockQueryRaw = vi.fn();
const mockIntentCreate = vi.fn();
const mockIntentRetrieve = vi.fn();
const mockIntentCancel = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    payment: {
      create: (...a: unknown[]) => mockPaymentCreate(...a),
      updateMany: (...a: unknown[]) => mockPaymentUpdateMany(...a),
      update: (...a: unknown[]) => mockPaymentUpdate(...a),
      findUnique: (...a: unknown[]) => mockPaymentFindUnique(...a),
      findFirst: (...a: unknown[]) => mockPaymentFindFirst(...a),
    },
    $transaction: async (cb: (tx: unknown) => unknown) =>
      cb({
        $queryRaw: (...a: unknown[]) => mockQueryRaw(...a),
        payment: { update: (...a: unknown[]) => mockPaymentUpdate(...a) },
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

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => ({
    paymentIntents: {
      create: (...a: unknown[]) => mockIntentCreate(...a),
      retrieve: (...a: unknown[]) => mockIntentRetrieve(...a),
      cancel: (...a: unknown[]) => mockIntentCancel(...a),
    },
  })),
}));

import { createStripeIntent, confirmStripeIntent, cancelStripeIntent } from './stripe-charge';

const cfg = { provider: 'stripe' as const, sandbox: true, publishableKey: 'pk_test', secretKey: 'sk_test' };

const freshInvoice = { id: 'inv_1', quoteId: 'q1', amountPaidCents: 0, totalCents: 4000, status: 'open' };

const createParams = {
  businessId: 'biz_1',
  invoiceId: 'inv_1',
  amountCents: 4000,
  idempotencyKey: 'stripe_key_1',
  description: 'Deposit for EST-0001',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoiceFindUniqueOrThrow.mockResolvedValue(freshInvoice);
  mockQuoteFindUniqueOrThrow.mockResolvedValue({ id: 'q1', status: 'invoiced' });
  mockQueryRaw.mockResolvedValue(undefined);
});

describe('createStripeIntent', () => {
  it('creates a fresh PaymentIntent with our idempotency key and stores providerRef', async () => {
    mockPaymentCreate.mockResolvedValue({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      idempotencyKey: 'stripe_key_1',
    });
    mockIntentCreate.mockResolvedValue({ id: 'pi_123', client_secret: 'pi_123_secret_abc' });
    mockPaymentUpdate.mockResolvedValue({});

    const result = await createStripeIntent(cfg, createParams);

    expect(mockIntentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4000, currency: 'usd' }),
      { idempotencyKey: 'stripe_key_1' },
    );
    expect(mockPaymentUpdate).toHaveBeenCalledWith({ where: { id: 'pay_1' }, data: { providerRef: 'pi_123' } });
    expect(result).toEqual({ outcome: 'created', paymentId: 'pay_1', clientSecret: 'pi_123_secret_abc' });
  });

  it('replays the existing client_secret without creating a second PaymentIntent', async () => {
    mockPaymentCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    mockPaymentUpdateMany.mockResolvedValue({ count: 0 });
    mockPaymentFindUnique.mockResolvedValue({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      providerRef: 'pi_123',
      idempotencyKey: 'stripe_key_1',
    });
    mockIntentRetrieve.mockResolvedValue({ id: 'pi_123', client_secret: 'pi_123_secret_abc' });

    const result = await createStripeIntent(cfg, createParams);

    expect(mockIntentCreate).not.toHaveBeenCalled();
    expect(mockIntentRetrieve).toHaveBeenCalledWith('pi_123');
    expect(result).toEqual({ outcome: 'already_awaiting_confirmation', paymentId: 'pay_1', clientSecret: 'pi_123_secret_abc' });
  });

  it('returns succeeded without calling Stripe again when the key already succeeded', async () => {
    mockPaymentCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    mockPaymentUpdateMany.mockResolvedValue({ count: 0 });
    mockPaymentFindUnique.mockResolvedValue({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'succeeded',
      idempotencyKey: 'stripe_key_1',
    });

    const result = await createStripeIntent(cfg, createParams);

    expect(mockIntentCreate).not.toHaveBeenCalled();
    expect(mockIntentRetrieve).not.toHaveBeenCalled();
    expect(result.outcome).toBe('succeeded');
  });

  it('rejects reusing the same idempotency key for a different invoice or amount', async () => {
    mockPaymentCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    mockPaymentUpdateMany.mockResolvedValue({ count: 0 });
    mockPaymentFindUnique.mockResolvedValue({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_DIFFERENT',
      amountCents: 999,
      status: 'succeeded',
      idempotencyKey: 'stripe_key_1',
    });

    const result = await createStripeIntent(cfg, createParams);

    expect(mockIntentCreate).not.toHaveBeenCalled();
    expect(result.outcome).toBe('key_reused_for_different_charge');
  });

  it('marks the row failed (reclaimable) rather than leaving it stuck when Stripe rejects the create call', async () => {
    mockPaymentCreate.mockResolvedValue({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      idempotencyKey: 'stripe_key_1',
    });
    mockIntentCreate.mockRejectedValue(new Error('Invalid API Key provided'));
    mockPaymentUpdate.mockResolvedValue({});

    const result = await createStripeIntent(cfg, createParams);

    expect(mockPaymentUpdate).toHaveBeenCalledWith({
      where: { idempotencyKey: 'stripe_key_1' },
      data: { status: 'failed', note: 'Invalid API Key provided' },
    });
    expect(result).toEqual({ outcome: 'failed', errorMessage: 'Invalid API Key provided' });
  });

  it('returns in_flight without crashing when a claimed row is missing providerRef (crash-window edge case)', async () => {
    mockPaymentCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    mockPaymentUpdateMany.mockResolvedValue({ count: 0 });
    mockPaymentFindUnique.mockResolvedValue({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      providerRef: null,
      idempotencyKey: 'stripe_key_1',
    });

    const result = await createStripeIntent(cfg, createParams);

    expect(mockIntentRetrieve).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: 'in_flight' });
  });
});

describe('confirmStripeIntent', () => {
  const confirmParams = { businessId: 'biz_1', invoiceId: 'inv_1', paymentId: 'pay_1' };

  it('credits the invoice only when the retrieved intent has succeeded', async () => {
    mockPaymentFindUnique.mockResolvedValueOnce({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      providerRef: 'pi_123',
      idempotencyKey: 'stripe_key_1',
    });
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    mockIntentRetrieve.mockResolvedValue({ id: 'pi_123', status: 'succeeded' });
    mockPaymentUpdate.mockResolvedValue({});
    mockPaymentFindUnique.mockResolvedValueOnce({ idempotencyKey: 'stripe_key_1', status: 'succeeded' });

    const result = await confirmStripeIntent(cfg, confirmParams);

    expect(mockInvoiceUpdate).toHaveBeenCalledWith({
      where: { id: 'inv_1' },
      data: { amountPaidCents: 4000, amountDueCents: 0, status: 'paid' },
    });
    expect(result.outcome).toBe('succeeded');
  });

  it('does not credit the invoice when the retrieved intent has not succeeded', async () => {
    mockPaymentFindUnique.mockResolvedValueOnce({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      providerRef: 'pi_123',
      idempotencyKey: 'stripe_key_1',
    });
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    mockIntentRetrieve.mockResolvedValue({ id: 'pi_123', status: 'requires_payment_method' });
    mockPaymentUpdate.mockResolvedValue({});

    const result = await confirmStripeIntent(cfg, confirmParams);

    expect(mockInvoiceUpdate).not.toHaveBeenCalled();
    expect(result.outcome).toBe('failed');
  });

  it('does not mark failed for intermediate Stripe statuses (processing) — rolls claim back', async () => {
    mockPaymentFindUnique.mockResolvedValueOnce({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      providerRef: 'pi_123',
      idempotencyKey: 'stripe_key_1',
    });
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    mockIntentRetrieve.mockResolvedValue({ id: 'pi_123', status: 'processing' });

    const result = await confirmStripeIntent(cfg, confirmParams);

    expect(mockInvoiceUpdate).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: 'in_flight' });
    expect(mockPaymentUpdateMany).toHaveBeenCalledWith({
      where: { id: 'pay_1', status: 'processing' },
      data: { status: 'awaiting_confirmation' },
    });
  });

  it('returns in_flight and does not call Stripe when a concurrent confirm already claimed it', async () => {
    mockPaymentFindUnique.mockResolvedValueOnce({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      providerRef: 'pi_123',
      idempotencyKey: 'stripe_key_1',
    });
    mockPaymentUpdateMany.mockResolvedValue({ count: 0 }); // lost the race

    const result = await confirmStripeIntent(cfg, confirmParams);

    expect(mockIntentRetrieve).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: 'in_flight' });
  });

  it('rejects a cross-tenant paymentId before ever calling Stripe', async () => {
    mockPaymentFindUnique.mockResolvedValueOnce({
      id: 'pay_1',
      businessId: 'biz_OTHER',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      providerRef: 'pi_123',
      idempotencyKey: 'stripe_key_1',
    });

    const result = await confirmStripeIntent(cfg, confirmParams);

    expect(mockIntentRetrieve).not.toHaveBeenCalled();
    expect(mockPaymentUpdateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: 'not_found' });
  });

  it('returns not_found for an unknown paymentId', async () => {
    mockPaymentFindUnique.mockResolvedValueOnce(null);
    const result = await confirmStripeIntent(cfg, confirmParams);
    expect(result).toEqual({ outcome: 'not_found' });
  });
});

describe('cancelStripeIntent', () => {
  it('flips awaiting_confirmation to failed and reports cancelled', async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: 'pay_1',
      providerRef: 'pi_123',
      status: 'awaiting_confirmation',
    });
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    const result = await cancelStripeIntent({ businessId: 'biz_1', invoiceId: 'inv_1', paymentId: 'pay_1' });
    expect(mockIntentCancel).not.toHaveBeenCalled(); // no cfg → local-only
    expect(mockPaymentUpdateMany).toHaveBeenCalledWith({
      where: { id: 'pay_1', businessId: 'biz_1', invoiceId: 'inv_1', status: 'awaiting_confirmation' },
      data: { status: 'failed' },
    });
    expect(result).toEqual({ cancelled: true });
  });

  it('best-effort cancels the PaymentIntent at Stripe when cfg is provided', async () => {
    mockPaymentFindFirst.mockResolvedValue({
      id: 'pay_1',
      providerRef: 'pi_123',
      status: 'awaiting_confirmation',
    });
    mockIntentCancel.mockResolvedValue({ id: 'pi_123', status: 'canceled' });
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    const result = await cancelStripeIntent(
      { businessId: 'biz_1', invoiceId: 'inv_1', paymentId: 'pay_1' },
      cfg,
    );
    expect(mockIntentCancel).toHaveBeenCalledWith('pi_123');
    expect(result).toEqual({ cancelled: true });
  });

  it('no-ops when the row is not in awaiting_confirmation (e.g. already processing or succeeded)', async () => {
    mockPaymentFindFirst.mockResolvedValue(null);
    const result = await cancelStripeIntent({ businessId: 'biz_1', invoiceId: 'inv_1', paymentId: 'pay_1' });
    expect(mockPaymentUpdateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ cancelled: false });
  });
});
