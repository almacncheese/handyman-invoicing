import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRequireSession = vi.fn();
const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockDeleteMany = vi.fn();
const mockEncryptSecret = vi.fn();

vi.mock('@/lib/session', () => ({ requireSession: () => mockRequireSession() }));
vi.mock('@/lib/db', () => ({
  prisma: {
    paymentGatewayConfig: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      upsert: (...a: unknown[]) => mockUpsert(...a),
      deleteMany: (...a: unknown[]) => mockDeleteMany(...a),
    },
  },
}));
vi.mock('@/lib/crypto', () => ({ encryptSecret: (...a: unknown[]) => mockEncryptSecret(...a) }));

import { GET, PUT } from './route';

function makeRequest(body?: unknown) {
  return new NextRequest('http://localhost:3000/api/business/payment-gateway', {
    method: 'PUT',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireSession.mockResolvedValue({
    userId: 'u1',
    businessId: 'biz_1',
    email: 'owner@example.com',
    role: 'owner',
    platformAdmin: false,
  });
  mockEncryptSecret.mockImplementation((s: string) => `enc(${s})`);
});

describe('GET /api/business/payment-gateway', () => {
  it('returns configured:false and no secret when nothing is set up', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await GET();
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/secretEnc|transactionKey|secretKey|accessToken|clientSecret/);
  });

  it('returns the provider and public fields, never the encrypted secret', async () => {
    mockFindUnique.mockResolvedValue({
      provider: 'authorize_net',
      sandbox: true,
      publicFields: { apiLoginId: 'login', clientKey: 'ck' },
      secretEnc: 'enc(super-secret)',
    });
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({
      provider: 'authorize_net',
      sandbox: true,
      publicFields: { apiLoginId: 'login', clientKey: 'ck' },
      configured: true,
    });
    expect(JSON.stringify(body)).not.toContain('super-secret');
  });
});

describe('PUT /api/business/payment-gateway', () => {
  it('rejects staff (owner-only)', async () => {
    mockRequireSession.mockResolvedValue({ businessId: 'biz_1', role: 'staff', email: 'staff@example.com' });
    const res = await PUT(makeRequest({ provider: 'authorize_net', apiLoginId: 'a', clientKey: 'c', transactionKey: 't' }));
    expect(res.status).toBe(403);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('creates a fresh authorize_net config, encrypting the transaction key', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await PUT(makeRequest({ provider: 'authorize_net', apiLoginId: 'a', clientKey: 'c', transactionKey: 't' }));

    expect(mockEncryptSecret).toHaveBeenCalledWith(JSON.stringify({ transactionKey: 't' }));
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: 'biz_1' },
        create: expect.objectContaining({
          businessId: 'biz_1',
          provider: 'authorize_net',
          publicFields: { apiLoginId: 'a', clientKey: 'c' },
          secretEnc: 'enc({"transactionKey":"t"})',
        }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it('rejects a fresh authorize_net config missing the transaction key', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await PUT(makeRequest({ provider: 'authorize_net', apiLoginId: 'a', clientKey: 'c' }));
    expect(res.status).toBe(422);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('preserves the existing encrypted secret when the secret field is blank and the provider is unchanged', async () => {
    mockFindUnique.mockResolvedValue({
      provider: 'authorize_net',
      sandbox: true,
      publicFields: { apiLoginId: 'old', clientKey: 'old-ck' },
      secretEnc: 'enc(existing-secret)',
    });

    const res = await PUT(makeRequest({ provider: 'authorize_net', apiLoginId: 'new', clientKey: 'new-ck' }));

    expect(mockEncryptSecret).not.toHaveBeenCalled();
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          publicFields: { apiLoginId: 'new', clientKey: 'new-ck' },
          secretEnc: 'enc(existing-secret)',
        }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it('rejects a blank secret when switching to a different provider', async () => {
    mockFindUnique.mockResolvedValue({
      provider: 'square',
      sandbox: true,
      publicFields: { applicationId: 'a', locationId: 'l' },
      secretEnc: 'enc(square-secret)',
    });

    const res = await PUT(makeRequest({ provider: 'authorize_net', apiLoginId: 'a', clientKey: 'c' }));

    expect(res.status).toBe(422);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('creates a stripe config', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await PUT(makeRequest({ provider: 'stripe', publishableKey: 'pk_test', secretKey: 'sk_test' }));
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ provider: 'stripe', publicFields: { publishableKey: 'pk_test' } }),
      }),
    );
  });

  it('creates a square config', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await PUT(
      makeRequest({ provider: 'square', applicationId: 'app1', locationId: 'loc1', accessToken: 'tok1' }),
    );
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ provider: 'square', publicFields: { applicationId: 'app1', locationId: 'loc1' } }),
      }),
    );
  });

  it('creates a paypal config', async () => {
    mockFindUnique.mockResolvedValue(null);
    const res = await PUT(makeRequest({ provider: 'paypal', clientId: 'cid1', clientSecret: 'csecret1' }));
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ provider: 'paypal', publicFields: { clientId: 'cid1' } }),
      }),
    );
  });

  it('clears the config when provider is none', async () => {
    const res = await PUT(makeRequest({ provider: 'none' }));
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { businessId: 'biz_1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(false);
  });
});
