import { describe, it, expect } from 'vitest';
// Failing tests first for TDD
// Test 3-invoice cap, monthly billing

describe('Billing - Starter 3-invoice cap + Monthly only', () => {
  it('Starter allows exactly 3 invoices then blocks', () => {
    // TODO: implement failing assertion first
    expect(true).toBe(false); // force fail until implemented
  });

  it('Cannot create annual subscription - monthly only', () => {
    // assert rejection
  });

  it('Upgrade from Starter resets/increments properly without double-charge', () => {
    // payment invariant
  });
});

// More tests coming...