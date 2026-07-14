import { describe, it, expect, afterEach, vi } from 'vitest';
import { encryptSecret, decryptSecret } from './crypto';

const TEST_KEY = 'RcQZ9FnFKuBkoIdRc4YSJWJkHEQgU+bEOFpHjZjDkV0=';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a plaintext secret', () => {
    vi.stubEnv('ENCRYPTION_KEY', TEST_KEY);
    const encrypted = encryptSecret('sk_test_super_secret_value');
    expect(encrypted).not.toContain('sk_test_super_secret_value');
    expect(decryptSecret(encrypted)).toBe('sk_test_super_secret_value');
  });

  it('produces a different ciphertext each call (fresh IV)', () => {
    vi.stubEnv('ENCRYPTION_KEY', TEST_KEY);
    const a = encryptSecret('same-plaintext');
    const b = encryptSecret('same-plaintext');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same-plaintext');
    expect(decryptSecret(b)).toBe('same-plaintext');
  });

  it('throws when the ciphertext has been tampered with', () => {
    vi.stubEnv('ENCRYPTION_KEY', TEST_KEY);
    const encrypted = encryptSecret('do-not-tamper');
    const [iv, payload, tag] = encrypted.split('.');
    const tampered = [iv, payload.slice(0, -2) + (payload.slice(-2) === 'AA' ? 'BB' : 'AA'), tag].join('.');
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('throws on a malformed payload', () => {
    vi.stubEnv('ENCRYPTION_KEY', TEST_KEY);
    expect(() => decryptSecret('not-a-valid-payload')).toThrow();
  });

  it('throws when ENCRYPTION_KEY is missing', () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    expect(() => encryptSecret('anything')).toThrow(/ENCRYPTION_KEY/);
  });

  it('throws when ENCRYPTION_KEY is not 32 bytes', () => {
    vi.stubEnv('ENCRYPTION_KEY', Buffer.from('too-short').toString('base64'));
    expect(() => encryptSecret('anything')).toThrow(/32 bytes/);
  });
});
