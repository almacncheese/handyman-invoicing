import { describe, it, expect } from 'vitest';
import {
  assertSameBusiness,
  belongsToBusiness,
  isValidPublicToken,
} from './authz';

const session = {
  userId: 'u1',
  businessId: 'b1',
  role: 'owner' as const,
  email: 'a@b.com',
  platformAdmin: false,
};

describe('authz', () => {
  it('allows same-business access', () => {
    expect(belongsToBusiness(session, { businessId: 'b1' })).toBe(true);
    expect(() => assertSameBusiness(session, { businessId: 'b1' })).not.toThrow();
  });

  it('denies cross-tenant as not found', () => {
    expect(belongsToBusiness(session, { businessId: 'b2' })).toBe(false);
    try {
      assertSameBusiness(session, { businessId: 'b2' });
      expect.fail('should throw');
    } catch (e) {
      expect((e as Error & { status: number }).status).toBe(404);
    }
  });

  it('denies missing session as 401', () => {
    try {
      assertSameBusiness(null, { businessId: 'b1' });
      expect.fail('should throw');
    } catch (e) {
      expect((e as Error & { status: number }).status).toBe(401);
    }
  });

  it('validates public token shape', () => {
    expect(isValidPublicToken('short')).toBe(false);
    expect(isValidPublicToken('a'.repeat(20))).toBe(true);
    expect(isValidPublicToken('../etc/passwd')).toBe(false);
    expect(isValidPublicToken('abc_DEF-0123456789xyz')).toBe(true);
  });
});
