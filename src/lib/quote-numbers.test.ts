import { describe, expect, it } from 'vitest';
import { formatQuoteNumber, allocateQuoteNumber } from './quote-numbers';

describe('formatQuoteNumber', () => {
  it('pads sequence', () => {
    expect(formatQuoteNumber('EST', 1)).toBe('EST-00001');
    expect(formatQuoteNumber('HQ', 42)).toBe('HQ-00042');
  });
});

describe('allocateQuoteNumber', () => {
  it('uses post-increment value minus one', async () => {
    const tx = {
      business: {
        update: async () => ({ quotePrefix: 'EST', nextQuoteNumber: 8 }),
      },
    };
    const n = await allocateQuoteNumber(tx, 'biz1');
    expect(n).toBe('EST-00007');
  });
});
