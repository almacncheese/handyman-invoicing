import { describe, it, expect } from 'vitest';
import { buildPaymentLinks } from './payment-links';

describe('buildPaymentLinks', () => {
  it('omits empty handles', () => {
    expect(buildPaymentLinks({})).toEqual([]);
  });

  it('builds cashapp and venmo deep links with amount', () => {
    const links = buildPaymentLinks(
      { cashappCashtag: '$DemoCo', venmoHandle: '@democo', zelleHandle: 'pay@demo.com' },
      5000,
    );
    expect(links).toHaveLength(3);
    expect(links.find((l) => l.kind === 'cashapp')?.href).toContain('/50.00');
    expect(links.find((l) => l.kind === 'venmo')?.href).toContain('amount=50.00');
    expect(links.find((l) => l.kind === 'zelle')?.display).toBe('pay@demo.com');
  });
});
