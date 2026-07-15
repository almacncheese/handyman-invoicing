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
const mockProcessCardCharge = vi.fn();
const mockLogActivity = vi.fn();
const mockLoadGatewayConfig = vi.fn();

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
vi.mock('@/lib/card-charge', () => ({ processCardCharge: (...a: unknown[]) => mockProcessCardCharge(...a) }));
vi.mock('@/lib/gateway-config', () => ({ loadGatewayConfig: (...a: unknown[]) => mockLoadGatewayConfig(...a) }));
vi.mock('@/lib/activity', () => ({ logActivity: (...a: unknown[]) => mockLogActivity(...a) }));

import { POST } from './route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/public/estimate/tok123/pay', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
function ctx(token = 'tok123') {
  return { params: Promise.resolve({ token }) };
}

const validBody = {
  amountChoice: 'deposit' as const,
  idempotencyKey: 'pay_key_1234567890',
  opaqueData: { dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT', dataValue: 'opaque-token' },
  billTo: { firstName: 'Jordan', lastName: 'Homeowner' },
};

const acceptedQuoteNoInvoice = {
  id: 'q1',
  businessId: 'biz_1',
  number: 'EST-0001',
  status: 'accepted',
  lineItems: [{ type: 'material', description: 'Widget', costCents: 10000, marginPercent: 0, qty: 1 }],
  taxPercent: 0,
  depositPercent: 30,
  depositCents: 3000,
  invoice: null,
};

const invoicedQuote = {
  ...acceptedQuoteNoInvoice,
  status: 'invoiced',
  invoice: { id: 'inv_1', status: 'open', amountDueCents: 7000 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsValidPublicToken.mockReturnValue(true);
  mockRateLimit.mockReturnValue({ ok: true });
  mockClientIp.mockReturnValue('1.2.3.4');
  mockLoadGatewayConfig.mockResolvedValue({
    provider: 'authorize_net',
    sandbox: true,
    apiLoginId: 'login',
    clientKey: 'ck',
    transactionKey: 'tk',
  });
});

describe('POST /api/public/estimate/[token]/pay — guards', () => {
  it('returns 404 for a malformed token before any DB query', async () => {
    mockIsValidPublicToken.mockReturnValue(false);
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(404);
    expect(mockQuoteFindUnique).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limited', async () => {
    mockRateLimit.mockReturnValue({ ok: false, retryAfterSec: 60 });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(429);
  });

  it('returns 404 for a void quote', async () => {
    mockQuoteFindUnique.mockResolvedValue({ ...acceptedQuoteNoInvoice, status: 'void' });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 409 when the quote has not been accepted and has no invoice yet', async () => {
    mockQuoteFindUnique.mockResolvedValue({ ...acceptedQuoteNoInvoice, status: 'sent' });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(409);
    expect(mockProcessCardCharge).not.toHaveBeenCalled();
  });

  it('returns 409 for a void invoice', async () => {
    mockQuoteFindUnique.mockResolvedValue({ ...invoicedQuote, invoice: { ...invoicedQuote.invoice, status: 'void' } });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(409);
    expect(mockProcessCardCharge).not.toHaveBeenCalled();
  });

  it('returns 409 when there is no balance remaining', async () => {
    mockQuoteFindUnique.mockResolvedValue({ ...invoicedQuote, invoice: { ...invoicedQuote.invoice, amountDueCents: 0 } });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(409);
    expect(mockProcessCardCharge).not.toHaveBeenCalled();
  });

  it('never accepts a client-supplied amountCents — only amountChoice is read from the body', async () => {
    mockQuoteFindUnique.mockResolvedValue(invoicedQuote);
    mockProcessCardCharge.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay1' } });
    await POST(makeRequest({ ...validBody, amountChoice: 'balance', amountCents: 1 }), ctx());
    expect(mockProcessCardCharge).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 7000 }));
  });
});

describe('POST /api/public/estimate/[token]/pay — amount resolution', () => {
  it('pays min(depositCents, amountDueCents) for the "deposit" choice', async () => {
    mockQuoteFindUnique.mockResolvedValue(invoicedQuote); // depositCents=3000, amountDueCents=7000
    mockProcessCardCharge.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay1' } });
    await POST(makeRequest({ ...validBody, amountChoice: 'deposit' }), ctx());
    expect(mockProcessCardCharge).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 3000 }));
  });

  it('pays the full amountDueCents for the "balance" choice', async () => {
    mockQuoteFindUnique.mockResolvedValue(invoicedQuote);
    mockProcessCardCharge.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay1' } });
    await POST(makeRequest({ ...validBody, amountChoice: 'balance' }), ctx());
    expect(mockProcessCardCharge).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 7000 }));
  });

  it('clamps the deposit choice to the remaining balance when it is smaller than the original deposit', async () => {
    mockQuoteFindUnique.mockResolvedValue({
      ...invoicedQuote,
      invoice: { ...invoicedQuote.invoice, amountDueCents: 1000 }, // less than depositCents=3000
    });
    mockProcessCardCharge.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay1' } });
    await POST(makeRequest({ ...validBody, amountChoice: 'deposit' }), ctx());
    expect(mockProcessCardCharge).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 1000 }));
  });
});

describe('POST /api/public/estimate/[token]/pay — lazy invoice conversion', () => {
  it('lazily converts an accepted-but-not-yet-invoiced quote to an invoice before charging', async () => {
    mockQuoteFindUnique.mockResolvedValue(acceptedQuoteNoInvoice);
    mockTxInvoiceFindUnique.mockResolvedValue(null);
    mockTxInvoiceCount.mockResolvedValue(4);
    mockTxInvoiceCreate.mockResolvedValue({ id: 'inv_new', number: 'INV-00005', amountDueCents: 10000 });
    mockProcessCardCharge.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay1' } });

    const res = await POST(makeRequest({ ...validBody, amountChoice: 'balance' }), ctx());

    expect(mockTxInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ quoteId: 'q1', number: 'INV-00005', businessId: 'biz_1' }) }),
    );
    expect(mockTxQuoteUpdate).toHaveBeenCalledWith({ where: { id: 'q1' }, data: { status: 'invoiced' } });
    expect(mockProcessCardCharge).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv_new', amountCents: 10000 }),
    );
    expect(res.status).toBe(201);
  });

  it('does not re-convert if another concurrent request already created the invoice inside the transaction', async () => {
    mockQuoteFindUnique.mockResolvedValue(acceptedQuoteNoInvoice);
    mockTxInvoiceFindUnique.mockResolvedValue({ id: 'inv_existing', number: 'INV-00002', amountDueCents: 5000 });
    mockProcessCardCharge.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay1' } });

    await POST(makeRequest({ ...validBody, amountChoice: 'balance' }), ctx());

    expect(mockTxInvoiceCreate).not.toHaveBeenCalled();
    expect(mockProcessCardCharge).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: 'inv_existing' }));
  });
});

describe('POST /api/public/estimate/[token]/pay — charge outcomes', () => {
  it('returns 201 and logs a customer-actor activity entry on success', async () => {
    mockQuoteFindUnique.mockResolvedValue(invoicedQuote);
    mockProcessCardCharge.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay1' } });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(201);
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ actorType: 'customer', action: 'payment_recorded' }));
  });

  it('returns 402 with the decline reason and does not log activity', async () => {
    mockQuoteFindUnique.mockResolvedValue(invoicedQuote);
    mockProcessCardCharge.mockResolvedValue({ outcome: 'failed', errorMessage: 'Card declined', payment: { id: 'pay1' } });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(402);
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it('returns 409 for an in-flight duplicate attempt', async () => {
    mockQuoteFindUnique.mockResolvedValue(invoicedQuote);
    mockProcessCardCharge.mockResolvedValue({ outcome: 'in_flight' });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(409);
  });
});

describe('POST /api/public/estimate/[token]/pay — gateway config dispatch', () => {
  it('passes config and authorize_net metadata through to processCardCharge', async () => {
    mockQuoteFindUnique.mockResolvedValue(invoicedQuote);
    mockProcessCardCharge.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay1' } });

    await POST(makeRequest(validBody), ctx());

    expect(mockProcessCardCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ provider: 'authorize_net' }),
        metadata: {
          opaqueDataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
          opaqueDataValue: 'opaque-token',
          invoiceNumber: 'EST-0001',
        },
      }),
    );
  });

  it('returns 409 when the business has no gateway configured', async () => {
    mockQuoteFindUnique.mockResolvedValue(invoicedQuote);
    mockLoadGatewayConfig.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(409);
    expect(mockProcessCardCharge).not.toHaveBeenCalled();
  });

  it('returns 409 when the configured provider is not one-shot (e.g. stripe/paypal)', async () => {
    mockQuoteFindUnique.mockResolvedValue(invoicedQuote);
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'paypal', sandbox: true, clientId: 'c', clientSecret: 's' });
    const res = await POST(makeRequest(validBody), ctx());
    expect(res.status).toBe(409);
    expect(mockProcessCardCharge).not.toHaveBeenCalled();
  });

  it('rejects when opaqueData is missing for an authorize_net-configured business', async () => {
    mockQuoteFindUnique.mockResolvedValue(invoicedQuote);
    const { opaqueData: _omit, ...bodyWithoutOpaqueData } = validBody;
    const res = await POST(makeRequest(bodyWithoutOpaqueData), ctx());
    expect(res.status).toBe(422);
    expect(mockProcessCardCharge).not.toHaveBeenCalled();
  });

  it('dispatches sourceId metadata for a square-configured business', async () => {
    mockQuoteFindUnique.mockResolvedValue(invoicedQuote);
    mockLoadGatewayConfig.mockResolvedValue({
      provider: 'square',
      sandbox: true,
      applicationId: 'app1',
      locationId: 'loc1',
      accessToken: 'token1',
    });
    mockProcessCardCharge.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay1' } });

    const { opaqueData: _omit, ...rest } = validBody;
    const res = await POST(makeRequest({ ...rest, sourceId: 'cnon:card-nonce-ok' }), ctx());

    expect(res.status).toBe(201);
    expect(mockProcessCardCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ provider: 'square' }),
        metadata: { sourceId: 'cnon:card-nonce-ok' },
      }),
    );
  });
});
