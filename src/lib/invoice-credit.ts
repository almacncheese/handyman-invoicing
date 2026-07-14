/**
 * Pure invoice-crediting arithmetic, extracted so the two new card-charge
 * routes share one rule set instead of independently hand-copying it.
 * Mirrors src/app/api/payments/record/route.ts's exact math (that file is
 * untouched — this is new code, not a refactor of it).
 */
export type InvoiceForCredit = {
  amountPaidCents: number;
  totalCents: number;
};

export type CreditResult = {
  amountPaidCents: number;
  amountDueCents: number;
  invoiceStatus: 'partial' | 'paid';
};

export function creditInvoicePayment(
  invoice: InvoiceForCredit,
  amountCents: number,
): CreditResult {
  const newPaid = invoice.amountPaidCents + amountCents;
  const fullyPaid = newPaid >= invoice.totalCents;
  return {
    amountPaidCents: newPaid,
    amountDueCents: Math.max(0, invoice.totalCents - newPaid),
    invoiceStatus: fullyPaid ? 'paid' : 'partial',
  };
}
