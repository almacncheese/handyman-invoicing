import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockIsValidPublicToken = vi.fn();
const mockRateLimit = vi.fn();
const mockClientIp = vi.fn();
const mockQuoteFindUnique = vi.fn();
const mockPublicGatewayConfig = vi.fn();

vi.mock('@/lib/authz', () => ({ isValidPublicToken: (...a: unknown[]) => mockIsValidPublicToken(...a) }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...a: unknown[]) => mockRateLimit(...a),
  clientIp: (...a: unknown[]) => mockClientIp(...a),
}));
vi.mock('@/lib/db', () => ({
  prisma: { quote: { findUnique: (...a: unknown[]) => mockQuoteFindUnique(...a) } },
}));
vi.mock('@/lib/gateway-config', () => ({
  publicGatewayConfig: (...a: unknown[]) => mockPublicGatewayConfig(...a),
}));

import { GET } from './route';

function makeRequest() {
  return new NextRequest('http://localhost:3000/api/public/estimate/tok123');
}
function ctx(token = 'tok123') {
  return { params: Promise.resolve({ token }) };
}

const baseQuote = {
  id: 'q1',
  title: 'Estimate',
  status: 'accepted',
  lineItems: [],
  taxPercent: 0,
  depositPercent: 30,
  subtotalCents: 10000,
  taxCents: 0,
  totalCents: 10000,
  depositCents: 3000,
  notes: null,
  jobAddress: null,
  acceptedAt: new Date(),
  signedName: 'Jordan',
  signatureData: 'data:image/png;base64,x',
  viewedAt: new Date(),
  businessId: 'biz_1',
  customer: null,
  business: {
    name: 'Demo Co',
    primaryColor: '#000',
    logoUrl: null,
    phone: null,
    email: null,
    paymentGatewayConfig: { provider: 'authorize_net', sandbox: true, publicFields: { apiLoginId: 'login', clientKey: 'key' } },
  },
  invoice: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockIsValidPublicToken.mockReturnValue(true);
  mockRateLimit.mockReturnValue({ ok: true });
  mockClientIp.mockReturnValue('1.2.3.4');
  mockPublicGatewayConfig.mockReturnValue({ provider: 'authorize_net', sandbox: true, apiLoginId: 'login', clientKey: 'key' });
  // Explicit default every test — vi.clearAllMocks() does not reset a mock's
  // resolved value (only mockReset() does), so without this, a test that
  // forgets its own mockResolvedValue silently inherits whatever the
  // previous test in this file configured.
  mockQuoteFindUnique.mockResolvedValue(baseQuote);
});

describe('GET /api/public/estimate/[token] — payment info exposure', () => {
  it('omits payment info for a not-yet-accepted quote', async () => {
    mockQuoteFindUnique.mockResolvedValue({ ...baseQuote, status: 'sent', viewedAt: new Date() });
    const res = await GET(makeRequest(), ctx());
    const body = await res.json();
    expect(body.estimate.payment).toBeFalsy();
  });

  it('exposes full quote total as balance (not deposit) for an accepted quote with no invoice yet', async () => {
    const res = await GET(makeRequest(), ctx());
    const body = await res.json();
    // depositCents stays on estimate for the deposit/balance chooser; balanceDue must match
    // what amountChoice=balance charges after lazy invoice convert (total, not deposit).
    expect(body.estimate.payment).toEqual({
      gatewayConfig: { provider: 'authorize_net', sandbox: true, apiLoginId: 'login', clientKey: 'key' },
      balanceDueCents: 10000,
    });
    expect(body.estimate.depositCents).toBe(3000);
  });

  it('exposes the invoice balance once the quote has been converted', async () => {
    mockQuoteFindUnique.mockResolvedValue({
      ...baseQuote,
      status: 'invoiced',
      invoice: { status: 'open', amountDueCents: 7000 },
    });
    const res = await GET(makeRequest(), ctx());
    const body = await res.json();
    expect(body.estimate.payment.balanceDueCents).toBe(7000);
  });

  it('omits payment info once the invoice is fully paid', async () => {
    mockQuoteFindUnique.mockResolvedValue({
      ...baseQuote,
      status: 'paid',
      invoice: { status: 'paid', amountDueCents: 0 },
    });
    const res = await GET(makeRequest(), ctx());
    const body = await res.json();
    expect(body.estimate.payment).toBeFalsy();
  });

  it('omits payment info for a void invoice', async () => {
    mockQuoteFindUnique.mockResolvedValue({
      ...baseQuote,
      status: 'invoiced',
      invoice: { status: 'void', amountDueCents: 7000 },
    });
    const res = await GET(makeRequest(), ctx());
    const body = await res.json();
    expect(body.estimate.payment).toBeFalsy();
  });

  it('still exposes balanceDueCents with a null gatewayConfig when no processor is configured', async () => {
    mockPublicGatewayConfig.mockReturnValue(null);
    const res = await GET(makeRequest(), ctx());
    const body = await res.json();
    expect(body.estimate.payment).toEqual({ gatewayConfig: null, balanceDueCents: 10000 });
  });
});
