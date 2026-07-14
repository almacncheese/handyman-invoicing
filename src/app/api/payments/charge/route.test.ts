import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireSession = vi.fn();
const mockInvoiceFindUnique = vi.fn();
const mockProcessCardCharge = vi.fn();
const mockLogActivity = vi.fn();
const mockClientIp = vi.fn();
const mockLoadGatewayConfig = vi.fn();

vi.mock('@/lib/session', () => ({ requireSession: () => mockRequireSession() }));
vi.mock('@/lib/db', () => ({
  prisma: { invoice: { findUnique: (...a: unknown[]) => mockInvoiceFindUnique(...a) } },
}));
vi.mock('@/lib/card-charge', () => ({ processCardCharge: (...a: unknown[]) => mockProcessCardCharge(...a) }));
vi.mock('@/lib/gateway-config', () => ({ loadGatewayConfig: (...a: unknown[]) => mockLoadGatewayConfig(...a) }));
vi.mock('@/lib/activity', () => ({ logActivity: (...a: unknown[]) => mockLogActivity(...a) }));
vi.mock('@/lib/rate-limit', () => ({ clientIp: (...a: unknown[]) => mockClientIp(...a) }));

import { POST } from './route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/payments/charge', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const validBody = {
  invoiceId: 'inv_1',
  amountCents: 4000,
  idempotencyKey: 'card_key_1234567890',
  opaqueData: { dataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT', dataValue: 'opaque-token' },
  billTo: { firstName: 'Jordan', lastName: 'Homeowner' },
};

const freshInvoice = {
  id: 'inv_1',
  businessId: 'biz_1',
  number: 'INV-00001',
  quoteId: 'q1',
  status: 'open',
  amountDueCents: 4000,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue({
    userId: 'u1',
    businessId: 'biz_1',
    email: 'owner@example.com',
    role: 'owner',
    platformAdmin: false,
  });
  mockInvoiceFindUnique.mockResolvedValue(freshInvoice);
  mockClientIp.mockReturnValue('1.2.3.4');
  mockLoadGatewayConfig.mockResolvedValue({
    provider: 'authorize_net',
    sandbox: true,
    apiLoginId: 'login',
    clientKey: 'ck',
    transactionKey: 'tk',
  });
});

describe('POST /api/payments/charge', () => {
  it('rejects an invoice belonging to a different business (404, no existence leak)', async () => {
    mockInvoiceFindUnique.mockResolvedValue({ ...freshInvoice, businessId: 'someone_else' });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
    expect(mockProcessCardCharge).not.toHaveBeenCalled();
  });

  it('rejects charging a void invoice', async () => {
    mockInvoiceFindUnique.mockResolvedValue({ ...freshInvoice, status: 'void' });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    expect(mockProcessCardCharge).not.toHaveBeenCalled();
  });

  it('rejects an amount greater than the balance due', async () => {
    const res = await POST(makeRequest({ ...validBody, amountCents: 999999 }));
    expect(res.status).toBe(422);
    expect(mockProcessCardCharge).not.toHaveBeenCalled();
  });

  it('charges successfully and logs activity', async () => {
    mockProcessCardCharge.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay_1' } });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(201);
    expect(mockProcessCardCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz_1',
        invoiceId: 'inv_1',
        amountCents: 4000,
        customerIp: '1.2.3.4',
        config: expect.objectContaining({ provider: 'authorize_net' }),
        metadata: {
          opaqueDataDescriptor: 'COMMON.ACCEPT.INAPP.PAYMENT',
          opaqueDataValue: 'opaque-token',
          invoiceNumber: 'INV-00001',
        },
      }),
    );
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'payment_recorded', meta: { amountCents: 4000, method: 'card' } }),
    );
  });

  it('returns 409 when the business has no payment gateway configured', async () => {
    mockLoadGatewayConfig.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    expect(mockProcessCardCharge).not.toHaveBeenCalled();
  });

  it('returns 409 when the configured provider is not one-shot (e.g. stripe/paypal)', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'stripe', sandbox: true, publishableKey: 'pk', secretKey: 'sk' });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
    expect(mockProcessCardCharge).not.toHaveBeenCalled();
  });

  it('rejects when opaqueData is missing for an authorize_net-configured business', async () => {
    const { opaqueData: _omit, ...bodyWithoutOpaqueData } = validBody;
    const res = await POST(makeRequest(bodyWithoutOpaqueData));
    expect(res.status).toBe(422);
    expect(mockProcessCardCharge).not.toHaveBeenCalled();
  });

  it('dispatches sourceId metadata for a square-configured business', async () => {
    mockLoadGatewayConfig.mockResolvedValue({
      provider: 'square',
      sandbox: true,
      applicationId: 'app1',
      locationId: 'loc1',
      accessToken: 'token1',
    });
    mockProcessCardCharge.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay_1' } });

    const { opaqueData: _omit, ...rest } = validBody;
    const res = await POST(makeRequest({ ...rest, sourceId: 'cnon:card-nonce-ok' }));

    expect(res.status).toBe(201);
    expect(mockProcessCardCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({ provider: 'square' }),
        metadata: { sourceId: 'cnon:card-nonce-ok' },
      }),
    );
  });

  it('rejects when sourceId is missing for a square-configured business', async () => {
    mockLoadGatewayConfig.mockResolvedValue({
      provider: 'square',
      sandbox: true,
      applicationId: 'app1',
      locationId: 'loc1',
      accessToken: 'token1',
    });
    const { opaqueData: _omit, ...rest } = validBody;
    const res = await POST(makeRequest(rest));
    expect(res.status).toBe(422);
    expect(mockProcessCardCharge).not.toHaveBeenCalled();
  });

  it('returns 402 with the decline reason when the card is declined, and does not log activity', async () => {
    mockProcessCardCharge.mockResolvedValue({
      outcome: 'failed',
      errorMessage: 'This transaction has been declined.',
      payment: { id: 'pay_1' },
    });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe('This transaction has been declined.');
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it('returns 409 when another attempt for the same idempotency key is already in flight', async () => {
    mockProcessCardCharge.mockResolvedValue({ outcome: 'in_flight' });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
  });

  it('returns 409 when the idempotency key was already used for a different charge', async () => {
    mockProcessCardCharge.mockResolvedValue({ outcome: 'key_reused_for_different_charge' });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
  });
});
