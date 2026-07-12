/**
 * Allocate next quote number under a business (caller runs in transaction).
 * Uses atomic increment so concurrent creates cannot share a number.
 */

export function formatQuoteNumber(prefix: string, n: number): string {
  const p = (prefix || 'EST').replace(/[^A-Za-z0-9-]/g, '').slice(0, 8) || 'EST';
  return `${p}-${String(n).padStart(5, '0')}`;
}

type TxBusiness = {
  business: {
    update: (args: {
      where: { id: string };
      data: { nextQuoteNumber: { increment: number } };
      select: { quotePrefix: true; nextQuoteNumber: true };
    }) => Promise<{ quotePrefix: string; nextQuoteNumber: number }>;
  };
};

/**
 * Atomically reserve the next quote sequence for a business.
 * `nextQuoteNumber` on the row is the *next* free value after this call;
 * the allocated display number uses the previous value.
 */
export async function allocateQuoteNumber(
  tx: TxBusiness,
  businessId: string,
): Promise<string> {
  const updated = await tx.business.update({
    where: { id: businessId },
    data: { nextQuoteNumber: { increment: 1 } },
    select: { quotePrefix: true, nextQuoteNumber: true },
  });
  // After increment, nextQuoteNumber is N+1; we allocated N.
  const allocated = updated.nextQuoteNumber - 1;
  return formatQuoteNumber(updated.quotePrefix, allocated);
}
