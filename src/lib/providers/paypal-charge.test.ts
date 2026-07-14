import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

vi.mock('@/lib/db', () => ({
  prisma: {
    payment: {
      create: (...a: unknown[]) => mockPaymentCreate(...a),
      updateMany: (...a: unknown[]) => mockPaymentUpdateMany(...a),
      update: (...a: unknown[]) => mockPaymentUpdate(...a),
      findUnique: (...a: unknown[]) => mockPaymentFindUnique(...a),
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

import { createPaypalOrder, capturePaypalOrder, cancelPaypalOrder } from './paypal-charge';

const cfg = { provider: 'paypal' as const, sandbox: true, clientId: 'client1', clientSecret: 'secret1' };
const freshInvoice = { id: 'inv_1', quoteId: 'q1', amountPaidCents: 0, totalCents: 4000, status: 'open' };

const createParams = {
  businessId: 'biz_1',
  invoiceId: 'inv_1',
  amountCents: 4000,
  idempotencyKey: 'pp_key_1',
  description: 'Deposit for EST-0001',
};

function mockFetchSequence(responses: Array<{ ok?: boolean; body: unknown }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({ ok: r.ok ?? true, json: async () => r.body });
  }
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInvoiceFindUniqueOrThrow.mockResolvedValue(freshInvoice);
  mockQuoteFindUniqueOrThrow.mockResolvedValue({ id: 'q1', status: 'invoiced' });
  mockQueryRaw.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createPaypalOrder', () => {
  it('exchanges OAuth2 credentials, creates an order, and stores providerRef', async () => {
    mockPaymentCreate.mockResolvedValue({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      idempotencyKey: 'pp_key_1',
    });
    const fetchMock = mockFetchSequence([
      { body: { access_token: 'access-tok-1' } },
      { body: { id: 'order_abc' } },
    ]);
    mockPaymentUpdate.mockResolvedValue({});

    const result = await createPaypalOrder(cfg, createParams);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/oauth2/token');
    expect(fetchMock.mock.calls[1][0]).toContain('/v2/checkout/orders');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer access-tok-1');
    expect(mockPaymentUpdate).toHaveBeenCalledWith({ where: { id: 'pay_1' }, data: { providerRef: 'order_abc' } });
    expect(result).toEqual({ outcome: 'created', paymentId: 'pay_1', orderId: 'order_abc' });
  });

  it('marks the row failed (reclaimable) rather than leaving it stuck when the OAuth2 token exchange fails', async () => {
    mockPaymentCreate.mockResolvedValue({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      idempotencyKey: 'pp_key_1',
    });
    mockFetchSequence([{ ok: false, body: { error_description: 'invalid_client' } }]);
    mockPaymentUpdate.mockResolvedValue({});

    const result = await createPaypalOrder(cfg, createParams);

    expect(mockPaymentUpdate).toHaveBeenCalledWith({
      where: { idempotencyKey: 'pp_key_1' },
      data: { status: 'failed', note: 'invalid_client' },
    });
    expect(result).toEqual({ outcome: 'failed', errorMessage: 'invalid_client' });
  });

  it('marks the row failed (reclaimable) rather than leaving it stuck when order creation fails', async () => {
    mockPaymentCreate.mockResolvedValue({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      idempotencyKey: 'pp_key_1',
    });
    mockFetchSequence([{ body: { access_token: 'access-tok-1' } }, { ok: false, body: { message: 'Order create failed' } }]);
    mockPaymentUpdate.mockResolvedValue({});

    const result = await createPaypalOrder(cfg, createParams);

    expect(mockPaymentUpdate).toHaveBeenCalledWith({
      where: { idempotencyKey: 'pp_key_1' },
      data: { status: 'failed', note: 'Order create failed' },
    });
    expect(result).toEqual({ outcome: 'failed', errorMessage: 'Order create failed' });
  });

  it('replays the stored orderId without calling PayPal again', async () => {
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
      providerRef: 'order_abc',
      idempotencyKey: 'pp_key_1',
    });
    const fetchMock = mockFetchSequence([]);

    const result = await createPaypalOrder(cfg, createParams);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: 'already_awaiting_confirmation', paymentId: 'pay_1', orderId: 'order_abc' });
  });

  it('returns succeeded without creating a new order when the key already succeeded', async () => {
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
      idempotencyKey: 'pp_key_1',
    });
    const fetchMock = mockFetchSequence([]);

    const result = await createPaypalOrder(cfg, createParams);

    expect(fetchMock).not.toHaveBeenCalled();
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
      idempotencyKey: 'pp_key_1',
    });

    const result = await createPaypalOrder(cfg, createParams);
    expect(result.outcome).toBe('key_reused_for_different_charge');
  });
});

describe('capturePaypalOrder', () => {
  const captureParams = { businessId: 'biz_1', invoiceId: 'inv_1', paymentId: 'pay_1' };

  it('credits the invoice only when the capture status is COMPLETED', async () => {
    mockPaymentFindUnique.mockResolvedValueOnce({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      providerRef: 'order_abc',
      idempotencyKey: 'pp_key_1',
    });
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    mockFetchSequence([
      { body: { access_token: 'access-tok-1' } },
      {
        body: {
          purchase_units: [{ payments: { captures: [{ id: 'capture_1', status: 'COMPLETED' }] } }],
        },
      },
    ]);
    mockPaymentUpdate.mockResolvedValue({});
    mockPaymentFindUnique.mockResolvedValueOnce({ idempotencyKey: 'pp_key_1', status: 'succeeded' });

    const result = await capturePaypalOrder(cfg, captureParams);

    expect(mockInvoiceUpdate).toHaveBeenCalledWith({
      where: { id: 'inv_1' },
      data: { amountPaidCents: 4000, amountDueCents: 0, status: 'paid' },
    });
    expect(result.outcome).toBe('succeeded');
  });

  it('does not credit the invoice when the capture status is not COMPLETED', async () => {
    mockPaymentFindUnique.mockResolvedValueOnce({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      providerRef: 'order_abc',
      idempotencyKey: 'pp_key_1',
    });
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    mockFetchSequence([
      { body: { access_token: 'access-tok-1' } },
      { ok: false, body: { message: 'DECLINED' } },
    ]);
    mockPaymentUpdate.mockResolvedValue({});

    const result = await capturePaypalOrder(cfg, captureParams);

    expect(mockInvoiceUpdate).not.toHaveBeenCalled();
    expect(result.outcome).toBe('failed');
  });

  it('returns in_flight and never calls PayPal when a concurrent capture already claimed it', async () => {
    mockPaymentFindUnique.mockResolvedValueOnce({
      id: 'pay_1',
      businessId: 'biz_1',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      providerRef: 'order_abc',
      idempotencyKey: 'pp_key_1',
    });
    mockPaymentUpdateMany.mockResolvedValue({ count: 0 });
    const fetchMock = mockFetchSequence([]);

    const result = await capturePaypalOrder(cfg, captureParams);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: 'in_flight' });
  });

  it('rejects a cross-tenant paymentId before ever calling PayPal', async () => {
    mockPaymentFindUnique.mockResolvedValueOnce({
      id: 'pay_1',
      businessId: 'biz_OTHER',
      invoiceId: 'inv_1',
      amountCents: 4000,
      status: 'awaiting_confirmation',
      providerRef: 'order_abc',
      idempotencyKey: 'pp_key_1',
    });
    const fetchMock = mockFetchSequence([]);

    const result = await capturePaypalOrder(cfg, captureParams);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: 'not_found' });
  });
});

describe('cancelPaypalOrder', () => {
  it('flips awaiting_confirmation to failed and reports cancelled', async () => {
    mockPaymentUpdateMany.mockResolvedValue({ count: 1 });
    const result = await cancelPaypalOrder({ businessId: 'biz_1', invoiceId: 'inv_1', paymentId: 'pay_1' });
    expect(result).toEqual({ cancelled: true });
  });

  it('no-ops when the row is not in awaiting_confirmation', async () => {
    mockPaymentUpdateMany.mockResolvedValue({ count: 0 });
    const result = await cancelPaypalOrder({ businessId: 'biz_1', invoiceId: 'inv_1', paymentId: 'pay_1' });
    expect(result).toEqual({ cancelled: false });
  });
});
