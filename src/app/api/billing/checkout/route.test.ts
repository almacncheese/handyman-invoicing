import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequireSession = vi.fn();
const mockFindUniqueOrThrow = vi.fn();
const mockUpdate = vi.fn();
const mockCustomersCreate = vi.fn();
const mockCheckoutSessionsCreate = vi.fn();

vi.mock('@/lib/session', () => ({
  requireSession: () => mockRequireSession(),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    business: {
      findUniqueOrThrow: (...args: unknown[]) => mockFindUniqueOrThrow(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));
vi.mock('@/lib/stripe', () => ({
  stripeClient: () => ({
    customers: { create: (...args: unknown[]) => mockCustomersCreate(...args) },
    checkout: {
      sessions: { create: (...args: unknown[]) => mockCheckoutSessionsCreate(...args) },
    },
  }),
}));
vi.mock('@/lib/config', () => ({
  getStripePriceId: () => 'price_test123',
  appUrl: () => 'http://localhost:3000',
}));

import { POST } from './route';

const baseBusiness = {
  id: 'biz_1',
  email: 'owner@example.com',
  name: 'Demo Handyman Co',
  plan: 'trial',
  trialEndsAt: new Date(Date.now() + 86_400_000),
  monthlyPriceCents: null,
  stripeCustomerId: null,
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
  mockFindUniqueOrThrow.mockResolvedValue(baseBusiness);
  mockCustomersCreate.mockResolvedValue({ id: 'cus_new123' });
  mockCheckoutSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session_abc' });
});

describe('POST /api/billing/checkout', () => {
  it('rejects staff — owner-only action', async () => {
    mockRequireSession.mockResolvedValue({
      userId: 'u2',
      businessId: 'biz_1',
      email: 'staff@example.com',
      role: 'staff',
      platformAdmin: false,
    });
    const res = await POST();
    expect(res.status).toBe(403);
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  it('rejects a business already on Pro', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ ...baseBusiness, plan: 'pro', trialEndsAt: null });
    const res = await POST();
    expect(res.status).toBe(400);
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  it('rejects a business with a platform-admin custom price override', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ ...baseBusiness, monthlyPriceCents: 1900 });
    const res = await POST();
    expect(res.status).toBe(400);
    expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
  });

  it('creates a new Stripe customer when the business has none yet, and persists it', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(mockCustomersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'owner@example.com', name: 'Demo Handyman Co' }),
    );
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'biz_1' },
      data: { stripeCustomerId: 'cus_new123' },
    });
    const body = await res.json();
    expect(body.url).toBe('https://checkout.stripe.com/session_abc');
  });

  it('reuses an existing Stripe customer id without creating a new one', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ ...baseBusiness, stripeCustomerId: 'cus_existing456' });
    await POST();
    expect(mockCustomersCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_existing456' }),
    );
  });

  it('stamps businessId onto the subscription metadata so later webhook events can resolve it', async () => {
    await POST();
    expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        subscription_data: { metadata: { businessId: 'biz_1' } },
        line_items: [{ price: 'price_test123', quantity: 1 }],
      }),
    );
  });
});
