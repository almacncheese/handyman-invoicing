import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequireSession = vi.fn();
const mockFindUniqueOrThrow = vi.fn();
const mockPortalSessionsCreate = vi.fn();

vi.mock('@/lib/session', () => ({
  requireSession: () => mockRequireSession(),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    business: {
      findUniqueOrThrow: (...args: unknown[]) => mockFindUniqueOrThrow(...args),
    },
  },
}));
vi.mock('@/lib/stripe', () => ({
  stripeClient: () => ({
    billingPortal: {
      sessions: { create: (...args: unknown[]) => mockPortalSessionsCreate(...args) },
    },
  }),
}));
vi.mock('@/lib/config', () => ({
  appUrl: () => 'http://localhost:3000',
}));

import { POST } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue({
    userId: 'u1',
    businessId: 'biz_1',
    email: 'owner@example.com',
    role: 'owner',
    platformAdmin: false,
  });
  mockFindUniqueOrThrow.mockResolvedValue({ id: 'biz_1', stripeCustomerId: 'cus_existing456' });
  mockPortalSessionsCreate.mockResolvedValue({ url: 'https://billing.stripe.com/session_xyz' });
});

describe('POST /api/billing/portal', () => {
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
    expect(mockPortalSessionsCreate).not.toHaveBeenCalled();
  });

  it('rejects a business that has never checked out (no Stripe customer yet)', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ id: 'biz_1', stripeCustomerId: null });
    const res = await POST();
    expect(res.status).toBe(400);
    expect(mockPortalSessionsCreate).not.toHaveBeenCalled();
  });

  it('creates a portal session for an existing Stripe customer and returns its url', async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(mockPortalSessionsCreate).toHaveBeenCalledWith({
      customer: 'cus_existing456',
      return_url: 'http://localhost:3000/billing',
    });
    const body = await res.json();
    expect(body.url).toBe('https://billing.stripe.com/session_xyz');
  });
});
