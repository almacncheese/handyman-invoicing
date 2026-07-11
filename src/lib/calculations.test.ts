import { describe, it, expect } from 'vitest';
import {
  calculateQuoteTotal,
  normalizeLineItems,
  lineTotalCents,
  QuoteCalcError,
} from './calculations';
import { formatUsd } from './money';

describe('Quote Calculations', () => {
  it('calculates total with material cost + margin + labor correctly (cents)', () => {
    // material: $100 cost + 20% margin = $120
    // labor: 4h × $50/h = $200
    // subtotal $320, no tax
    const result = calculateQuoteTotal(
      [
        { type: 'material', cost: 100, marginPercent: 20 },
        { type: 'labor', hours: 4, rate: 50 },
      ],
      { taxPercent: 0, depositPercent: 0 },
    );
    expect(result.subtotalCents).toBe(32000);
    expect(result.taxCents).toBe(0);
    expect(result.totalCents).toBe(32000);
    expect(result.lineTotalsCents).toEqual([12000, 20000]);
  });

  it('applies tax and deposit percentages', () => {
    // subtotal 10000 + 8.25% tax = 825 → total 10825; deposit 30% = 3248
    const result = calculateQuoteTotal(
      [{ type: 'flat', amount: 100 }],
      { taxPercent: 8.25, depositPercent: 30 },
    );
    expect(result.subtotalCents).toBe(10000);
    expect(result.taxCents).toBe(825);
    expect(result.totalCents).toBe(10825);
    expect(result.depositCents).toBe(3248); // Math.round(10825 * 0.3)
  });

  it('handles empty line items as zero totals', () => {
    const result = calculateQuoteTotal([]);
    expect(result.subtotalCents).toBe(0);
    expect(result.totalCents).toBe(0);
  });

  it('rejects negative cost', () => {
    expect(() =>
      calculateQuoteTotal([{ type: 'material', cost: -1, marginPercent: 10 }]),
    ).toThrow(QuoteCalcError);
  });

  it('rejects unknown line type', () => {
    expect(() =>
      normalizeLineItems([{ type: 'widget', cost: 1 }]),
    ).toThrow(/material\|labor\|flat/);
  });

  it('supports fractional labor hours', () => {
    // 1.5h × $60/h = $90
    expect(
      lineTotalCents({ type: 'labor', hours: 1.5, rateCents: 6000 }),
    ).toBe(9000);
  });

  it('formats USD from cents', () => {
    expect(formatUsd(32000)).toBe('$320.00');
    expect(formatUsd(5)).toBe('$0.05');
  });

  it('material qty multiplies sell unit', () => {
    // 2 × ($50 + 10% = $55) = $110
    const result = calculateQuoteTotal([
      { type: 'material', cost: 50, marginPercent: 10, qty: 2 },
    ]);
    expect(result.subtotalCents).toBe(11000);
  });
});
