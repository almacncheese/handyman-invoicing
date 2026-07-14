import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireSession = vi.fn();
const mockPaymentFindUnique = vi.fn();
const mockLoadGatewayConfig = vi.fn();
const mockConfirmStripeIntent = vi.fn();
const mockCancelStripeIntent = vi.fn();
const mockCapturePaypalOrder = vi.fn();
const mockCancelPaypalOrder = vi.fn();
const mockLogActivity = vi.fn();

vi.mock('@/lib/session', () => ({ requireSession: () => mockRequireSession() }));
vi.mock('@/lib/db', () => ({
  prisma: { payment: { findUnique: (...a: unknown[]) => mockPaymentFindUnique(...a) } },
}));
vi.mock('@/lib/gateway-config', () => ({ loadGatewayConfig: (...a: unknown[]) => mockLoadGatewayConfig(...a) }));
vi.mock('@/lib/providers/stripe-charge', () => ({
  confirmStripeIntent: (...a: unknown[]) => mockConfirmStripeIntent(...a),
  cancelStripeIntent: (...a: unknown[]) => mockCancelStripeIntent(...a),
}));
vi.mock('@/lib/providers/paypal-charge', () => ({
  capturePaypalOrder: (...a: unknown[]) => mockCapturePaypalOrder(...a),
  cancelPaypalOrder: (...a: unknown[]) => mockCancelPaypalOrder(...a),
}));
vi.mock('@/lib/activity', () => ({ logActivity: (...a: unknown[]) => mockLogActivity(...a) }));

import { POST } from './route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost:3000/api/payments/confirm', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const stripeRow = { businessId: 'biz_1', invoiceId: 'inv_1', provider: 'stripe' };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue({
    userId: 'u1',
    businessId: 'biz_1',
    email: 'owner@example.com',
    role: 'owner',
    platformAdmin: false,
  });
  mockPaymentFindUnique.mockResolvedValue(stripeRow);
  mockLoadGatewayConfig.mockResolvedValue({ provider: 'stripe', sandbox: true, publishableKey: 'pk', secretKey: 'sk' });
});

describe('POST /api/payments/confirm', () => {
  it('returns 404 for a payment belonging to a different business (no existence leak)', async () => {
    mockPaymentFindUnique.mockResolvedValue({ ...stripeRow, businessId: 'someone_else' });
    const res = await POST(makeRequest({ paymentId: 'pay_1' }));
    expect(res.status).toBe(404);
    expect(mockConfirmStripeIntent).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown paymentId', async () => {
    mockPaymentFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ paymentId: 'pay_1' }));
    expect(res.status).toBe(404);
  });

  it('returns 409 when the gateway config no longer matches the payment\'s original provider', async () => {
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'paypal', sandbox: true, clientId: 'c', clientSecret: 's' });
    const res = await POST(makeRequest({ paymentId: 'pay_1' }));
    expect(res.status).toBe(409);
    expect(mockConfirmStripeIntent).not.toHaveBeenCalled();
  });

  it('confirms a Stripe intent, deriving invoiceId server-side (never trusting the client)', async () => {
    mockConfirmStripeIntent.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay_1' } });
    const res = await POST(makeRequest({ paymentId: 'pay_1', invoiceId: 'inv_SPOOFED' }));

    expect(mockConfirmStripeIntent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'stripe' }),
      { businessId: 'biz_1', invoiceId: 'inv_1', paymentId: 'pay_1' },
    );
    expect(res.status).toBe(201);
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: 'biz_1', invoiceId: 'inv_1', action: 'payment_recorded' }),
    );
  });

  it('returns 402 with the decline reason when Stripe reports the payment did not succeed', async () => {
    mockConfirmStripeIntent.mockResolvedValue({ outcome: 'failed', errorMessage: 'Payment was not completed', payment: {} });
    const res = await POST(makeRequest({ paymentId: 'pay_1' }));
    expect(res.status).toBe(402);
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it('returns 409 when a concurrent confirm already claimed it', async () => {
    mockConfirmStripeIntent.mockResolvedValue({ outcome: 'in_flight' });
    const res = await POST(makeRequest({ paymentId: 'pay_1' }));
    expect(res.status).toBe(409);
  });

  it('cancels a Stripe intent when action=cancel', async () => {
    mockCancelStripeIntent.mockResolvedValue({ cancelled: true });
    const res = await POST(makeRequest({ paymentId: 'pay_1', action: 'cancel' }));

    expect(mockCancelStripeIntent).toHaveBeenCalledWith({ businessId: 'biz_1', invoiceId: 'inv_1', paymentId: 'pay_1' });
    expect(mockConfirmStripeIntent).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ cancelled: true });
  });

  it('captures a PayPal order for a paypal-configured business', async () => {
    mockPaymentFindUnique.mockResolvedValue({ businessId: 'biz_1', invoiceId: 'inv_1', provider: 'paypal' });
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'paypal', sandbox: true, clientId: 'c', clientSecret: 's' });
    mockCapturePaypalOrder.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay_1' } });

    const res = await POST(makeRequest({ paymentId: 'pay_1' }));

    expect(mockCapturePaypalOrder).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'paypal' }),
      { businessId: 'biz_1', invoiceId: 'inv_1', paymentId: 'pay_1' },
    );
    expect(res.status).toBe(201);
  });

  it('cancels a PayPal order when action=cancel', async () => {
    mockPaymentFindUnique.mockResolvedValue({ businessId: 'biz_1', invoiceId: 'inv_1', provider: 'paypal' });
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'paypal', sandbox: true, clientId: 'c', clientSecret: 's' });
    mockCancelPaypalOrder.mockResolvedValue({ cancelled: true });

    const res = await POST(makeRequest({ paymentId: 'pay_1', action: 'cancel' }));

    expect(mockCancelPaypalOrder).toHaveBeenCalledWith({ businessId: 'biz_1', invoiceId: 'inv_1', paymentId: 'pay_1' });
    expect(res.status).toBe(200);
  });
});
