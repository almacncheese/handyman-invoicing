import { describe, it, expect } from 'vitest';
import { creditInvoicePayment } from './invoice-credit';

describe('creditInvoicePayment', () => {
  it('marks the invoice partial when the payment does not cover the full balance', () => {
    const result = creditInvoicePayment({ amountPaidCents: 0, totalCents: 10000 }, 4000);
    expect(result.amountPaidCents).toBe(4000);
    expect(result.amountDueCents).toBe(6000);
    expect(result.invoiceStatus).toBe('partial');
  });

  it('marks the invoice paid when the payment exactly covers the remaining balance', () => {
    const result = creditInvoicePayment({ amountPaidCents: 6000, totalCents: 10000 }, 4000);
    expect(result.amountPaidCents).toBe(10000);
    expect(result.amountDueCents).toBe(0);
    expect(result.invoiceStatus).toBe('paid');
  });

  it('clamps amountDueCents to zero rather than going negative on an overpayment', () => {
    const result = creditInvoicePayment({ amountPaidCents: 9000, totalCents: 10000 }, 5000);
    expect(result.amountPaidCents).toBe(14000);
    expect(result.amountDueCents).toBe(0);
    expect(result.invoiceStatus).toBe('paid');
  });

  it('accumulates on top of prior partial payments', () => {
    const result = creditInvoicePayment({ amountPaidCents: 2500, totalCents: 10000 }, 2500);
    expect(result.amountPaidCents).toBe(5000);
    expect(result.amountDueCents).toBe(5000);
    expect(result.invoiceStatus).toBe('partial');
  });
});
