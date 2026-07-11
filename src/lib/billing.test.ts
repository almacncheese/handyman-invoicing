import { describe, expect, it } from 'vitest';
import { addTrialDays, resolveBilling } from './billing';

describe('resolveBilling', () => {
  const now = new Date('2026-07-11T12:00:00Z');

  it('pro always active', () => {
    const b = resolveBilling({ plan: 'pro', trialEndsAt: null, now });
    expect(b.canUseProduct).toBe(true);
    expect(b.isPro).toBe(true);
  });

  it('active trial can use product', () => {
    const b = resolveBilling({
      plan: 'trial',
      trialEndsAt: addTrialDays(now, 10),
      now,
    });
    expect(b.canUseProduct).toBe(true);
    expect(b.isTrial).toBe(true);
    expect(b.trialDaysLeft).toBeGreaterThan(0);
  });

  it('expired trial cannot use product', () => {
    const b = resolveBilling({
      plan: 'trial',
      trialEndsAt: new Date('2026-06-01T00:00:00Z'),
      now,
    });
    expect(b.canUseProduct).toBe(false);
    expect(b.isExpired).toBe(true);
    expect(b.plan).toBe('expired');
  });
});
