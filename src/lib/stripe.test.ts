import { describe, it, expect } from 'vitest';
import { mapStripeSubscriptionToBusinessFields, isStaleEvent } from './stripe';

describe('mapStripeSubscriptionToBusinessFields', () => {
  it('active status maps to pro with no trial end', () => {
    const fields = mapStripeSubscriptionToBusinessFields(
      { id: 'sub_1', status: 'active' },
      1_800_000_000,
    );
    expect(fields.plan).toBe('pro');
    expect(fields.trialEndsAt).toBeNull();
    expect(fields.stripeSubscriptionId).toBe('sub_1');
    expect(fields.stripeSubscriptionStatus).toBe('active');
  });

  it('trialing status maps to pro (Stripe-side trial, not ours)', () => {
    const fields = mapStripeSubscriptionToBusinessFields(
      { id: 'sub_1', status: 'trialing' },
      1_800_000_000,
    );
    expect(fields.plan).toBe('pro');
    expect(fields.trialEndsAt).toBeNull();
  });

  it('past_due status still maps to pro — Stripe Smart Retries handle the grace period', () => {
    const fields = mapStripeSubscriptionToBusinessFields(
      { id: 'sub_1', status: 'past_due' },
      1_800_000_000,
    );
    expect(fields.plan).toBe('pro');
    expect(fields.trialEndsAt).toBeNull();
  });

  it('canceled status maps to trial with an immediate gate', () => {
    const fields = mapStripeSubscriptionToBusinessFields(
      { id: 'sub_1', status: 'canceled' },
      1_800_000_000,
    );
    expect(fields.plan).toBe('trial');
    expect(fields.trialEndsAt).toEqual(new Date(1_800_000_000 * 1000));
  });

  it('unpaid status maps to trial with an immediate gate', () => {
    const fields = mapStripeSubscriptionToBusinessFields(
      { id: 'sub_1', status: 'unpaid' },
      1_800_000_000,
    );
    expect(fields.plan).toBe('trial');
    expect(fields.trialEndsAt).toEqual(new Date(1_800_000_000 * 1000));
  });

  it('incomplete_expired status maps to trial with an immediate gate', () => {
    const fields = mapStripeSubscriptionToBusinessFields(
      { id: 'sub_1', status: 'incomplete_expired' },
      1_800_000_000,
    );
    expect(fields.plan).toBe('trial');
    expect(fields.trialEndsAt).toEqual(new Date(1_800_000_000 * 1000));
  });

  it('always sets stripeLastEventAt from the event timestamp', () => {
    const fields = mapStripeSubscriptionToBusinessFields(
      { id: 'sub_1', status: 'active' },
      1_800_000_000,
    );
    expect(fields.stripeLastEventAt).toEqual(new Date(1_800_000_000 * 1000));
  });
});

describe('isStaleEvent', () => {
  it('is never stale when the business has no prior event recorded', () => {
    expect(isStaleEvent(1_800_000_000, null)).toBe(false);
  });

  it('is stale when the incoming event is older than or equal to the last applied one', () => {
    const lastApplied = new Date(1_800_000_000 * 1000);
    expect(isStaleEvent(1_799_999_999, lastApplied)).toBe(true);
    expect(isStaleEvent(1_800_000_000, lastApplied)).toBe(true);
  });

  it('is not stale when the incoming event is newer than the last applied one', () => {
    const lastApplied = new Date(1_800_000_000 * 1000);
    expect(isStaleEvent(1_800_000_001, lastApplied)).toBe(false);
  });
});
