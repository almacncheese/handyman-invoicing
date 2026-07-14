import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encryptSecret } from './crypto';

const TEST_KEY = 'RcQZ9FnFKuBkoIdRc4YSJWJkHEQgU+bEOFpHjZjDkV0=';

const mockFindUnique = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    paymentGatewayConfig: {
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
    },
  },
}));

import { loadGatewayConfig, publicGatewayConfig } from './gateway-config';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ENCRYPTION_KEY', TEST_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('loadGatewayConfig', () => {
  it('returns null when the business has no gateway configured', async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await loadGatewayConfig('biz_1')).toBeNull();
  });

  it('decrypts and merges public+secret fields for authorize_net', async () => {
    mockFindUnique.mockResolvedValue({
      provider: 'authorize_net',
      sandbox: true,
      publicFields: { apiLoginId: 'login123', clientKey: 'clientkey456' },
      secretEnc: encryptSecret(JSON.stringify({ transactionKey: 'txnkey789' })),
    });

    const cfg = await loadGatewayConfig('biz_1');

    expect(cfg).toEqual({
      provider: 'authorize_net',
      sandbox: true,
      apiLoginId: 'login123',
      clientKey: 'clientkey456',
      transactionKey: 'txnkey789',
    });
  });

  it('decrypts and merges public+secret fields for stripe', async () => {
    mockFindUnique.mockResolvedValue({
      provider: 'stripe',
      sandbox: true,
      publicFields: { publishableKey: 'pk_test_abc' },
      secretEnc: encryptSecret(JSON.stringify({ secretKey: 'sk_test_abc' })),
    });

    const cfg = await loadGatewayConfig('biz_1');

    expect(cfg).toEqual({
      provider: 'stripe',
      sandbox: true,
      publishableKey: 'pk_test_abc',
      secretKey: 'sk_test_abc',
    });
  });

  it('decrypts and merges public+secret fields for square', async () => {
    mockFindUnique.mockResolvedValue({
      provider: 'square',
      sandbox: false,
      publicFields: { applicationId: 'app123', locationId: 'loc456' },
      secretEnc: encryptSecret(JSON.stringify({ accessToken: 'sq0atp-abc' })),
    });

    const cfg = await loadGatewayConfig('biz_1');

    expect(cfg).toEqual({
      provider: 'square',
      sandbox: false,
      applicationId: 'app123',
      locationId: 'loc456',
      accessToken: 'sq0atp-abc',
    });
  });

  it('decrypts and merges public+secret fields for paypal', async () => {
    mockFindUnique.mockResolvedValue({
      provider: 'paypal',
      sandbox: true,
      publicFields: { clientId: 'client123' },
      secretEnc: encryptSecret(JSON.stringify({ clientSecret: 'secret456' })),
    });

    const cfg = await loadGatewayConfig('biz_1');

    expect(cfg).toEqual({
      provider: 'paypal',
      sandbox: true,
      clientId: 'client123',
      clientSecret: 'secret456',
    });
  });

  it('throws (fails closed) rather than returning garbage when secretEnc is tampered', async () => {
    const encrypted = encryptSecret(JSON.stringify({ transactionKey: 'txnkey789' }));
    const [iv, payload, tag] = encrypted.split('.');
    const tampered = [iv, payload.slice(0, -2) + (payload.slice(-2) === 'AA' ? 'BB' : 'AA'), tag].join('.');
    mockFindUnique.mockResolvedValue({
      provider: 'authorize_net',
      sandbox: true,
      publicFields: { apiLoginId: 'login123', clientKey: 'clientkey456' },
      secretEnc: tampered,
    });

    await expect(loadGatewayConfig('biz_1')).rejects.toThrow();
  });

  it('throws when publicFields do not match the provider schema', async () => {
    mockFindUnique.mockResolvedValue({
      provider: 'authorize_net',
      sandbox: true,
      publicFields: { totallyWrongShape: true },
      secretEnc: encryptSecret(JSON.stringify({ transactionKey: 'txnkey789' })),
    });

    await expect(loadGatewayConfig('biz_1')).rejects.toThrow();
  });

  it('throws when the decrypted secret does not match the provider schema', async () => {
    mockFindUnique.mockResolvedValue({
      provider: 'authorize_net',
      sandbox: true,
      publicFields: { apiLoginId: 'login123', clientKey: 'clientkey456' },
      secretEnc: encryptSecret(JSON.stringify({ wrongField: 'oops' })),
    });

    await expect(loadGatewayConfig('biz_1')).rejects.toThrow();
  });

  it('throws for an unknown provider string', async () => {
    mockFindUnique.mockResolvedValue({
      provider: 'venmo_direct',
      sandbox: true,
      publicFields: {},
      secretEnc: encryptSecret(JSON.stringify({})),
    });

    await expect(loadGatewayConfig('biz_1')).rejects.toThrow();
  });
});

describe('publicGatewayConfig', () => {
  it('returns null for a null row', () => {
    expect(publicGatewayConfig(null)).toBeNull();
  });

  it('strips to provider/sandbox/publicFields only, never a secret field', () => {
    const result = publicGatewayConfig({
      provider: 'authorize_net',
      sandbox: true,
      publicFields: { apiLoginId: 'login123', clientKey: 'clientkey456' },
    });

    expect(result).toEqual({
      provider: 'authorize_net',
      sandbox: true,
      apiLoginId: 'login123',
      clientKey: 'clientkey456',
    });
    expect(JSON.stringify(result)).not.toMatch(/transactionKey|secretKey|accessToken|clientSecret/i);
  });

  it('fails closed to null when publicFields is corrupt for the provider', () => {
    const result = publicGatewayConfig({
      provider: 'square',
      sandbox: true,
      publicFields: { totallyWrongShape: true },
    });
    expect(result).toBeNull();
  });

  it('fails closed to null for an unknown provider string', () => {
    const result = publicGatewayConfig({
      provider: 'venmo_direct',
      sandbox: true,
      publicFields: {},
    });
    expect(result).toBeNull();
  });
});
