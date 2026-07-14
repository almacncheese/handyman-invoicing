import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockIsValidPublicToken = vi.fn();
const mockQuoteFindUnique = vi.fn();
const mockPaymentFindUnique = vi.fn();
const mockLoadGatewayConfig = vi.fn();
const mockConfirmStripeIntent = vi.fn();
const mockCancelStripeIntent = vi.fn();
const mockCapturePaypalOrder = vi.fn();
const mockCancelPaypalOrder = vi.fn();
const mockLogActivity = vi.fn();

vi.mock('@/lib/authz', () => ({ isValidPublicToken: (...a: unknown[]) => mockIsValidPublicToken(...a) }));
vi.mock('@/lib/db', () => ({
  prisma: {
    quote: { findUnique: (...a: unknown[]) => mockQuoteFindUnique(...a) },
    payment: { findUnique: (...a: unknown[]) => mockPaymentFindUnique(...a) },
  },
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
  return new NextRequest('http://localhost:3000/api/public/estimate/tok123/pay/confirm', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
function ctx(token = 'tok123') {
  return { params: Promise.resolve({ token }) };
}

const stripeRow = { businessId: 'biz_1', invoiceId: 'inv_1', provider: 'stripe' };

beforeEach(() => {
  vi.clearAllMocks();
  mockIsValidPublicToken.mockReturnValue(true);
  mockQuoteFindUnique.mockResolvedValue({ businessId: 'biz_1' });
  mockPaymentFindUnique.mockResolvedValue(stripeRow);
  mockLoadGatewayConfig.mockResolvedValue({ provider: 'stripe', sandbox: true, publishableKey: 'pk', secretKey: 'sk' });
});

describe('POST /api/public/estimate/[token]/pay/confirm', () => {
  it('returns 404 for a malformed token before any DB query', async () => {
    mockIsValidPublicToken.mockReturnValue(false);
    const res = await POST(makeRequest({ paymentId: 'pay_1' }), ctx());
    expect(res.status).toBe(404);
    expect(mockQuoteFindUnique).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown token', async () => {
    mockQuoteFindUnique.mockResolvedValue(null);
    const res = await POST(makeRequest({ paymentId: 'pay_1' }), ctx());
    expect(res.status).toBe(404);
  });

  it("returns 404 when the payment does not belong to this token's business", async () => {
    mockPaymentFindUnique.mockResolvedValue({ ...stripeRow, businessId: 'someone_else' });
    const res = await POST(makeRequest({ paymentId: 'pay_1' }), ctx());
    expect(res.status).toBe(404);
    expect(mockConfirmStripeIntent).not.toHaveBeenCalled();
  });

  it('confirms a Stripe intent, deriving invoiceId server-side', async () => {
    mockConfirmStripeIntent.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay_1' } });
    const res = await POST(makeRequest({ paymentId: 'pay_1' }), ctx());

    expect(mockConfirmStripeIntent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'stripe' }),
      { businessId: 'biz_1', invoiceId: 'inv_1', paymentId: 'pay_1' },
    );
    expect(res.status).toBe(201);
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ actorType: 'customer', action: 'payment_recorded' }));
  });

  it('returns 402 when Stripe reports the payment did not succeed', async () => {
    mockConfirmStripeIntent.mockResolvedValue({ outcome: 'failed', errorMessage: 'Payment was not completed', payment: {} });
    const res = await POST(makeRequest({ paymentId: 'pay_1' }), ctx());
    expect(res.status).toBe(402);
  });

  it('cancels a Stripe intent when action=cancel', async () => {
    mockCancelStripeIntent.mockResolvedValue({ cancelled: true });
    const res = await POST(makeRequest({ paymentId: 'pay_1', action: 'cancel' }), ctx());
    expect(mockCancelStripeIntent).toHaveBeenCalledWith({ businessId: 'biz_1', invoiceId: 'inv_1', paymentId: 'pay_1' });
    expect(res.status).toBe(200);
  });

  it('captures a PayPal order for a paypal-configured business', async () => {
    mockPaymentFindUnique.mockResolvedValue({ businessId: 'biz_1', invoiceId: 'inv_1', provider: 'paypal' });
    mockLoadGatewayConfig.mockResolvedValue({ provider: 'paypal', sandbox: true, clientId: 'c', clientSecret: 's' });
    mockCapturePaypalOrder.mockResolvedValue({ outcome: 'succeeded', payment: { id: 'pay_1' } });

    const res = await POST(makeRequest({ paymentId: 'pay_1' }), ctx());
    expect(res.status).toBe(201);
  });
});
