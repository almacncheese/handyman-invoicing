/** Self-contained seed helpers (no imports from src/ — works in Docker runner). */

import { randomBytes } from 'crypto';

export type SeedLine =
  | {
      type: 'material';
      description: string;
      costCents: number;
      marginPercent: number;
      qty: number;
    }
  | { type: 'labor'; description: string; hours: number; rateCents: number }
  | { type: 'flat'; description: string; amountCents: number };

export function generatePublicToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url').slice(0, 32);
}

export function formatQuoteNumber(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

export function calculateQuoteTotal(
  lines: SeedLine[],
  opts: { taxPercent: number; depositPercent: number },
) {
  let subtotalCents = 0;
  for (const line of lines) {
    if (line.type === 'material') {
      const sell = Math.round(line.costCents * (1 + line.marginPercent / 100));
      subtotalCents += Math.round(sell * line.qty);
    } else if (line.type === 'labor') {
      subtotalCents += Math.round(line.hours * line.rateCents);
    } else {
      subtotalCents += line.amountCents;
    }
  }
  const taxCents = Math.round(subtotalCents * (opts.taxPercent / 100));
  const totalCents = subtotalCents + taxCents;
  const depositCents = Math.round(totalCents * (opts.depositPercent / 100));
  return { subtotalCents, taxCents, totalCents, depositCents };
}
