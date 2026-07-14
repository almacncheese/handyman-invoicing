import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireSession = vi.fn();
const mockInvoiceFindUnique = vi.fn();
const mockLoadGatewayConfig = vi.fn();
const mockCreateStripeIntent = vi.fn();
const mockCreatePaypalOrder = vi.fn();

vi.mock('@/lib/session', () => ({ requireSession: () => mockRequireSession() }));
vi.mock('@/lib/db', () => ({
  prisma: { invoice: { findUnique: (...a: unknown[]) => mockInvoiceFindUnique(...a) } },
}));
vi.mock('@/lib/gateway-config', () => ({ loadGatewayConfig: (...a: unknown[]) => mockLoadGatewayConfig(...a) }));
vi.mock('@/lib/providers/stripe-charge', () => ({
  createStripeIntent: (...a: unknown[]) => mockCreateStripeIntent(...a),
}));
vi.mock('@/lib/providers/paypal-charge', () => ({
  createPaypalOrder: (...a: unknown[]) => mockCreatePaypalOrder(...a),
}));

import { POST } from './route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/payments/intent', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const validBody = { invoiceId: 'inv_1', amountCents: 4000, idempotencyKey: 'intent_key_1234567890' };

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
});

describe('POST /api/payments/intent', () => {
  it('rejects an invoice belonging to a different business (404, no existence leak)', async () => {
    mockInvoiceFindUnique.mockResolvedValue({ ...freshInvoice, businessId: 'someone_else' });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(404);
  });

  it('rejects charging a void invoice', async () => {
    mockInvoiceFindUnique.mockResolvedValue({ ...freshInvoice, status: 'void' });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
  });

  it('rejects an amount greater than the balance due', async () => {
    const res = await POST(makeRequest({ ...validBody, amountCents: 999999 }));
    expect(res.status).toBe(422);
  });

  it('returns 409 when the business has no gateway configured', async () => {
    mockLoadGatewayConfig.mockResolvedValue(null);
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
  });

  it('returns 409 for a one-shot provider (authorize_net/square are not intent-based)', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'square', sandbox: true, applicationId: 'a', locationId: 'l', accessToken: 't' });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
  });

  it('creates a Stripe intent and returns the client secret', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'stripe', sandbox: true, publishableKey: 'pk', secretKey: 'sk' });
    mockCreateStripeIntent.mockResolvedValue({ outcome: 'created', paymentId: 'pay_1', clientSecret: 'pi_secret' });

    const res = await POST(makeRequest(validBody));

    expect(mockCreateStripeIntent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'stripe' }),
      expect.objectContaining({ businessId: 'biz_1', invoiceId: 'inv_1', amountCents: 4000 }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ paymentId: 'pay_1', provider: 'stripe', clientSecret: 'pi_secret' });
  });

  it('creates a PayPal order and returns the orderId', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'paypal', sandbox: true, clientId: 'c', clientSecret: 's' });
    mockCreatePaypalOrder.mockResolvedValue({ outcome: 'created', paymentId: 'pay_1', orderId: 'order_abc' });

    const res = await POST(makeRequest(validBody));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ paymentId: 'pay_1', provider: 'paypal', orderId: 'order_abc' });
  });

  it('returns 200 (not 201) on replay while awaiting_confirmation', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'stripe', sandbox: true, publishableKey: 'pk', secretKey: 'sk' });
    mockCreateStripeIntent.mockResolvedValue({
      outcome: 'already_awaiting_confirmation',
      paymentId: 'pay_1',
      clientSecret: 'pi_secret',
    });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
  });

  it('returns the existing payment when the key already succeeded', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'stripe', sandbox: true, publishableKey: 'pk', secretKey: 'sk' });
    mockCreateStripeIntent.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay_1' } });

    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outcome).toBe('succeeded');
  });

  it('returns 409 when another attempt is in flight', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'stripe', sandbox: true, publishableKey: 'pk', secretKey: 'sk' });
    mockCreateStripeIntent.mockResolvedValue({ outcome: 'in_flight' });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
  });

  it('returns 409 when the idempotency key was reused for a different charge', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'stripe', sandbox: true, publishableKey: 'pk', secretKey: 'sk' });
    mockCreateStripeIntent.mockResolvedValue({ outcome: 'key_reused_for_different_charge' });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(409);
  });

  it('returns 402 with the error message when Stripe rejects the create call outright', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'stripe', sandbox: true, publishableKey: 'pk', secretKey: 'sk' });
    mockCreateStripeIntent.mockResolvedValue({ outcome: 'failed', errorMessage: 'Invalid API Key provided' });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe('Invalid API Key provided');
  });

  it('returns 402 with the error message when PayPal rejects the create call outright', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'paypal', sandbox: true, clientId: 'c', clientSecret: 's' });
    mockCreatePaypalOrder.mockResolvedValue({ outcome: 'failed', errorMessage: 'invalid_client' });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe('invalid_client');
  });
});
