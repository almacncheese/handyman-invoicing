import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockConstructEvent = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();
const mockStripeEventCreate = vi.fn();
const mockBusinessFindUnique = vi.fn();
const mockBusinessFindUniqueOrThrow = vi.fn();
const mockBusinessUpdate = vi.fn();
const mockQueryRaw = vi.fn();

vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe');
  return {
    ...actual,
    stripeClient: () => ({
      webhooks: { constructEvent: (...args: unknown[]) => mockConstructEvent(...args) },
      subscriptions: { retrieve: (...args: unknown[]) => mockSubscriptionsRetrieve(...args) },
    }),
  };
});
vi.mock('@/lib/config', () => ({
  getStripeWebhookSecret: () => 'whsec_test',
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: (cb: (tx: unknown) => unknown) =>
      cb({
        stripeEvent: { create: (...args: unknown[]) => mockStripeEventCreate(...args) },
        business: {
          findUnique: (...args: unknown[]) => mockBusinessFindUnique(...args),
          findUniqueOrThrow: (...args: unknown[]) => mockBusinessFindUniqueOrThrow(...args),
          update: (...args: unknown[]) => mockBusinessUpdate(...args),
        },
        $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
      }),
  },
}));

import { Prisma } from '@prisma/client';
import { POST } from './route';

function makeRequest(body: string, signature = 'sig_valid') {
  return new NextRequest('http://localhost:3000/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': signature },
    body,
  });
}

function subscriptionEvent(overrides: {
  type: string;
  id?: string;
  created?: number;
  subId?: string;
  status?: string;
  businessId?: string;
  customerId?: string;
}) {
  return {
    id: overrides.id ?? 'evt_1',
    type: overrides.type,
    created: overrides.created ?? 1_800_000_000,
    data: {
      object: {
        id: overrides.subId ?? 'sub_1',
        status: overrides.status ?? 'active',
        customer: overrides.customerId ?? 'cus_1',
        metadata: overrides.businessId ? { businessId: overrides.businessId } : {},
      },
    },
  };
}

const freshBusiness = {
  id: 'biz_1',
  stripeCustomerId: 'cus_1',
  stripeSubscriptionId: null,
  stripeLastEventAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockStripeEventCreate.mockResolvedValue({ id: 'evt_1' });
  mockBusinessFindUnique.mockResolvedValue({ id: 'biz_1' });
  mockBusinessFindUniqueOrThrow.mockResolvedValue(freshBusiness);
  mockQueryRaw.mockResolvedValue(undefined);
});

describe('POST /api/stripe/webhook — signature verification', () => {
  it('rejects a request with an invalid signature', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('signature mismatch');
    });
    const res = await POST(makeRequest('{}', 'sig_bad'));
    expect(res.status).toBe(400);
    expect(mockStripeEventCreate).not.toHaveBeenCalled();
  });

  it('rejects a request with no signature header at all', async () => {
    const req = new NextRequest('http://localhost:3000/api/stripe/webhook', {
      method: 'POST',
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });
});

describe('POST /api/stripe/webhook — irrelevant event types', () => {
  it('no-ops on an event type it does not care about, without touching the DB', async () => {
    mockConstructEvent.mockReturnValue({ id: 'evt_x', type: 'invoice.paid', created: 1, data: { object: {} } });
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockStripeEventCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/stripe/webhook — idempotency', () => {
  it('processes a subscription.updated event exactly once when the same event id arrives twice', async () => {
    const event = subscriptionEvent({ type: 'customer.subscription.updated', status: 'active' });
    mockConstructEvent.mockReturnValue(event);

    await POST(makeRequest('{}'));
    expect(mockBusinessUpdate).toHaveBeenCalledTimes(1);

    // Second delivery of the identical event id: the StripeEvent insert now collides
    mockStripeEventCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.19.3' }),
    );
    const res2 = await POST(makeRequest('{}'));
    expect(res2.status).toBe(200);
    expect(mockBusinessUpdate).toHaveBeenCalledTimes(1); // still just once
  });
});

describe('POST /api/stripe/webhook — out-of-order delivery', () => {
  it('skips a subscription.updated event older than the last one already applied', async () => {
    mockBusinessFindUniqueOrThrow.mockResolvedValue({
      ...freshBusiness,
      stripeLastEventAt: new Date(1_800_000_100 * 1000),
    });
    const staleEvent = subscriptionEvent({
      type: 'customer.subscription.updated',
      created: 1_800_000_000, // older than stripeLastEventAt above
      businessId: 'biz_1',
    });
    mockConstructEvent.mockReturnValue(staleEvent);

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockBusinessUpdate).not.toHaveBeenCalled();
  });

  it('applies a subscription.updated event newer than the last one already applied', async () => {
    mockBusinessFindUniqueOrThrow.mockResolvedValue({
      ...freshBusiness,
      stripeLastEventAt: new Date(1_800_000_000 * 1000),
    });
    const newerEvent = subscriptionEvent({
      type: 'customer.subscription.updated',
      created: 1_800_000_100,
      businessId: 'biz_1',
    });
    mockConstructEvent.mockReturnValue(newerEvent);

    await POST(makeRequest('{}'));
    expect(mockBusinessUpdate).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/stripe/webhook — event handling', () => {
  it('customer.subscription.updated with a canceled status gates the business back to trial', async () => {
    const event = subscriptionEvent({
      type: 'customer.subscription.updated',
      status: 'canceled',
      businessId: 'biz_1',
      created: 1_800_000_000,
    });
    mockConstructEvent.mockReturnValue(event);

    await POST(makeRequest('{}'));
    expect(mockBusinessUpdate).toHaveBeenCalledWith({
      where: { id: 'biz_1' },
      data: {
        plan: 'trial',
        trialEndsAt: new Date(1_800_000_000 * 1000),
        stripeSubscriptionId: 'sub_1',
        stripeSubscriptionStatus: 'canceled',
        stripeLastEventAt: new Date(1_800_000_000 * 1000),
      },
    });
  });

  it('customer.subscription.deleted flips the business back to trial with an immediate gate', async () => {
    const event = subscriptionEvent({
      type: 'customer.subscription.deleted',
      status: 'canceled',
      businessId: 'biz_1',
      created: 1_800_000_000,
    });
    mockConstructEvent.mockReturnValue(event);

    await POST(makeRequest('{}'));
    expect(mockBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ plan: 'trial' }) }),
    );
  });

  it('resolves the business via stripeCustomerId when subscription metadata has no businessId', async () => {
    // No businessId in metadata means the route never attempts a metadata lookup at
    // all — it goes straight to the stripeCustomerId fallback, which is this one call.
    const event = subscriptionEvent({
      type: 'customer.subscription.updated',
      status: 'active',
      customerId: 'cus_1',
      // no businessId in metadata
    });
    mockConstructEvent.mockReturnValue(event);

    await POST(makeRequest('{}'));
    expect(mockBusinessFindUnique).toHaveBeenLastCalledWith({ where: { stripeCustomerId: 'cus_1' } });
    expect(mockBusinessUpdate).toHaveBeenCalledTimes(1);
  });

  it('logs and no-ops when neither metadata businessId nor stripeCustomerId resolves any business', async () => {
    mockBusinessFindUnique.mockResolvedValue(null);
    const event = subscriptionEvent({ type: 'customer.subscription.updated', status: 'active' });
    mockConstructEvent.mockReturnValue(event);

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockBusinessUpdate).not.toHaveBeenCalled();
  });

  it('checkout.session.completed retrieves the subscription and updates the business to pro', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      created: 1_800_000_000,
      data: {
        object: { id: 'cs_1', customer: 'cus_1', subscription: 'sub_1' },
      },
    });
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_1',
      status: 'active',
      metadata: { businessId: 'biz_1' },
      customer: 'cus_1',
    });

    await POST(makeRequest('{}'));
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_1');
    expect(mockBusinessUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'biz_1' },
        data: expect.objectContaining({ plan: 'pro', stripeSubscriptionId: 'sub_1' }),
      }),
    );
  });
});
