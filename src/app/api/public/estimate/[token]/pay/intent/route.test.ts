import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockIsValidPublicToken = vi.fn();
const mockRateLimit = vi.fn();
const mockClientIp = vi.fn();
const mockQuoteFindUnique = vi.fn();
const mockTxInvoiceFindUnique = vi.fn();
const mockTxInvoiceCount = vi.fn();
const mockTxInvoiceCreate = vi.fn();
const mockTxQuoteUpdate = vi.fn();
const mockQueryRaw = vi.fn();
const mockLogActivity = vi.fn();
const mockLoadGatewayConfig = vi.fn();
const mockCreateStripeIntent = vi.fn();
const mockCreatePaypalOrder = vi.fn();

vi.mock('@/lib/authz', () => ({ isValidPublicToken: (...a: unknown[]) => mockIsValidPublicToken(...a) }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...a: unknown[]) => mockRateLimit(...a),
  clientIp: (...a: unknown[]) => mockClientIp(...a),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    quote: { findUnique: (...a: unknown[]) => mockQuoteFindUnique(...a) },
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
vi.mock('@/lib/gateway-config', () => ({ loadGatewayConfig: (...a: unknown[]) => mockLoadGatewayConfig(...a) }));
vi.mock('@/lib/providers/stripe-charge', () => ({
  createStripeIntent: (...a: unknown[]) => mockCreateStripeIntent(...a),
}));
vi.mock('@/lib/providers/paypal-charge', () => ({
  createPaypalOrder: (...a: unknown[]) => mockCreatePaypalOrder(...a),
}));

import { POST } from './route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/public/estimate/tok123/pay/intent', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
function ctx(token = 'tok123') {
  return { params: Promise.resolve({ token }) };
}

const validBody = { amountChoice: 'deposit' as const, idempotencyKey: 'intent_key_1234567890' };

const invoicedQuote = {
  id: 'q1',
  businessId: 'biz_1',
  number: 'EST-0001',
  status: 'invoiced',
  lineItems: [{ type: 'material', costCents: 10000, marginPercent: 0, qty: 1 }],
  taxPercent: 0,
  depositPercent: 30,
  depositCents: 3000,
  invoice: { id: 'inv_1', status: 'open', amountDueCents: 7000 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsValidPublicToken.mockReturnValue(true);
  mockRateLimit.mockReturnValue({ ok: true });
  mockClientIp.mockReturnValue('1.2.3.4');
  mockQuoteFindUnique.mockResolvedValue(invoicedQuote);
});

describe('POST /api/public/estimate/[token]/pay/intent — guards', () => {
  it('returns 404 for a malformed token before any DB query', async () => {
    mockIsValidPublicToken.mockReturnValue(false);
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(404);
    expect(mockQuoteFindUnique).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimit.mockReturnValue({ ok: false });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(429);
  });

  it('returns 404 for a void quote', async () => {
    mockQuoteFindUnique.mockResolvedValue({ ...invoicedQuote, status: 'void' });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 409 for a void invoice', async () => {
    mockQuoteFindUnique.mockResolvedValue({ ...invoicedQuote, invoice: { ...invoicedQuote.invoice, status: 'void' } });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(409);
  });

  it('returns 409 when the business has no gateway configured', async () => {
    mockLoadGatewayConfig.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(409);
  });

  it('returns 409 for a one-shot provider (authorize_net/square are not intent-based)', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'authorize_net', sandbox: true, apiLoginId: 'a', clientKey: 'c', transactionKey: 't' });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(409);
  });
});

describe('POST /api/public/estimate/[token]/pay/intent — lazy invoice conversion', () => {
  it('lazily converts an accepted-but-not-yet-invoiced quote before creating the intent', async () => {
    mockQuoteFindUnique.mockResolvedValue({ ...invoicedQuote, status: 'accepted', invoice: null });
    mockTxInvoiceFindUnique.mockResolvedValue(null);
    mockTxInvoiceCount.mockResolvedValue(4);
    mockTxInvoiceCreate.mockResolvedValue({ id: 'inv_new', number: 'INV-00005', amountDueCents: 10000 });
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'stripe', sandbox: true, publishableKey: 'pk', secretKey: 'sk' });
    mockCreateStripeIntent.mockResolvedValue({ outcome: 'created', paymentId: 'pay_1', clientSecret: 'pi_secret' });

    const res = await POST(makeRequest({ ...validBody, amountChoice: 'balance' }), ctx());

    expect(mockTxInvoiceCreate).toHaveBeenCalled();
    expect(mockCreateStripeIntent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'stripe' }),
      expect.objectContaining({ invoiceId: 'inv_new', amountCents: 10000 }),
    );
    expect(res.status).toBe(201);
  });
});

describe('POST /api/public/estimate/[token]/pay/intent — provider dispatch', () => {
  it('creates a Stripe intent and returns the client secret', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'stripe', sandbox: true, publishableKey: 'pk', secretKey: 'sk' });
    mockCreateStripeIntent.mockResolvedValue({ outcome: 'created', paymentId: 'pay_1', clientSecret: 'pi_secret' });

    const res = await POST(makeRequest(validBody), ctx());

    expect(mockCreateStripeIntent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'stripe' }),
      expect.objectContaining({ businessId: 'biz_1', invoiceId: 'inv_1', amountCents: 3000 }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ paymentId: 'pay_1', provider: 'stripe', clientSecret: 'pi_secret' });
  });

  it('creates a PayPal order and returns the orderId', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'paypal', sandbox: true, clientId: 'c', clientSecret: 's' });
    mockCreatePaypalOrder.mockResolvedValue({ outcome: 'created', paymentId: 'pay_1', orderId: 'order_abc' });

    const res = await POST(makeRequest(validBody), ctx());

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ paymentId: 'pay_1', provider: 'paypal', orderId: 'order_abc' });
  });

  it('returns 409 for an in-flight duplicate attempt', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'stripe', sandbox: true, publishableKey: 'pk', secretKey: 'sk' });
    mockCreateStripeIntent.mockResolvedValue({ outcome: 'in_flight' });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(409);
  });

  it('returns 402 with the error message when Stripe rejects the create call outright', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'stripe', sandbox: true, publishableKey: 'pk', secretKey: 'sk' });
    mockCreateStripeIntent.mockResolvedValue({ outcome: 'failed', errorMessage: 'Invalid API Key provided' });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(402);
  });

  it('returns 402 with the error message when PayPal rejects the create call outright', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'paypal', sandbox: true, clientId: 'c', clientSecret: 's' });
    mockCreatePaypalOrder.mockResolvedValue({ outcome: 'failed', errorMessage: 'invalid_client' });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(402);
  });
});
