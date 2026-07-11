/**
 * Allocate next quote number under a business (caller runs in transaction).
 */

export function formatQuoteNumber(prefix: string, n: number): string {
  const p = (prefix || 'EST').replace(/[^A-Za-z0-9-]/g, '').slice(0, 8) || 'EST';
  return `${p}-${String(n).padStart(5, '0')}`;
}
