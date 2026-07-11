/**
 * Server-authoritative quote math (HandyQuote).
 * Ported lessons from aim-estimator/lib/totals.php:
 * - pure functions, no I/O
 * - client preview is UX only; save API recomputes
 *
 * Money unit: integer cents everywhere.
 */

import { dollarsToCents, percentOfCents } from './money';

export type LineItemType = 'material' | 'labor' | 'flat';

export type MaterialLine = {
  type: 'material';
  description?: string;
  /** Cost basis in cents (what you pay the supplier). */
  costCents: number;
  /** Markup percent applied to cost (20 = 20% → sell = cost * 1.20). */
  marginPercent: number;
  qty?: number;
};

export type LaborLine = {
  type: 'labor';
  description?: string;
  hours: number;
  /** Hourly rate in cents. */
  rateCents: number;
};

export type FlatLine = {
  type: 'flat';
  description?: string;
  /** Flat sell amount in cents. */
  amountCents: number;
  qty?: number;
};

export type QuoteLineItem = MaterialLine | LaborLine | FlatLine;

/** Loose input shape accepted at API boundary (pre-normalize). */
export type LooseLineInput = {
  type: string;
  description?: string;
  cost?: number;
  costCents?: number;
  marginPercent?: number;
  hours?: number;
  rate?: number;
  rateCents?: number;
  amount?: number;
  amountCents?: number;
  qty?: number;
};

export type QuoteTotals = {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
  lineTotalsCents: number[];
};

export class QuoteCalcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteCalcError';
  }
}

function assertNonNeg(n: number, label: string): void {
  if (!Number.isFinite(n) || n < 0) {
    throw new QuoteCalcError(`${label} must be a non-negative finite number`);
  }
}

/**
 * Normalize API / form input into strict line items.
 * Accepts either cents fields or dollar floats (cost/rate/amount).
 */
export function normalizeLineItems(raw: LooseLineInput[]): QuoteLineItem[] {
  if (!Array.isArray(raw)) {
    throw new QuoteCalcError('lineItems must be an array');
  }
  if (raw.length > 200) {
    throw new QuoteCalcError('Too many line items (max 200)');
  }

  return raw.map((item, i) => {
    const type = (item.type || '').toLowerCase();
    const qty = item.qty ?? 1;
    assertNonNeg(qty, `line[${i}].qty`);

    if (type === 'material') {
      const costCents =
        item.costCents !== undefined
          ? item.costCents
          : item.cost !== undefined
            ? dollarsToCents(item.cost)
            : NaN;
      const marginPercent = item.marginPercent ?? 0;
      assertNonNeg(costCents, `line[${i}].cost`);
      assertNonNeg(marginPercent, `line[${i}].marginPercent`);
      if (marginPercent > 1000) {
        throw new QuoteCalcError(`line[${i}].marginPercent unreasonably high`);
      }
      return {
        type: 'material' as const,
        description: item.description,
        costCents: Math.round(costCents),
        marginPercent,
        qty,
      };
    }

    if (type === 'labor') {
      const rateCents =
        item.rateCents !== undefined
          ? item.rateCents
          : item.rate !== undefined
            ? dollarsToCents(item.rate)
            : NaN;
      const hours = item.hours ?? 0;
      assertNonNeg(hours, `line[${i}].hours`);
      assertNonNeg(rateCents, `line[${i}].rate`);
      return {
        type: 'labor' as const,
        description: item.description,
        hours,
        rateCents: Math.round(rateCents),
      };
    }

    if (type === 'flat' || type === 'fee') {
      const amountCents =
        item.amountCents !== undefined
          ? item.amountCents
          : item.amount !== undefined
            ? dollarsToCents(item.amount)
            : NaN;
      assertNonNeg(amountCents, `line[${i}].amount`);
      return {
        type: 'flat' as const,
        description: item.description,
        amountCents: Math.round(amountCents),
        qty,
      };
    }

    throw new QuoteCalcError(`line[${i}].type must be material|labor|flat`);
  });
}

export function lineTotalCents(line: QuoteLineItem): number {
  switch (line.type) {
    case 'material': {
      const qty = line.qty ?? 1;
      const sellUnit = line.costCents + percentOfCents(line.costCents, line.marginPercent);
      return Math.round(sellUnit * qty);
    }
    case 'labor':
      // hours may be fractional (1.5h); round final cents
      return Math.round(line.hours * line.rateCents);
    case 'flat': {
      const qty = line.qty ?? 1;
      return Math.round(line.amountCents * qty);
    }
    default: {
      const _exhaustive: never = line;
      return _exhaustive;
    }
  }
}

export type CalculateQuoteOptions = {
  taxPercent?: number;
  depositPercent?: number;
};

function isStrictLine(item: unknown): item is QuoteLineItem {
  if (!item || typeof item !== 'object') return false;
  const line = item as QuoteLineItem;
  if (line.type === 'material') return typeof line.costCents === 'number';
  if (line.type === 'labor') return typeof line.rateCents === 'number';
  if (line.type === 'flat') return typeof line.amountCents === 'number';
  return false;
}

/**
 * Calculate quote totals. Accepts strict or loose line items.
 */
export function calculateQuoteTotal(
  lineItems: QuoteLineItem[] | LooseLineInput[],
  options: CalculateQuoteOptions = {},
): QuoteTotals {
  const taxPercent = options.taxPercent ?? 0;
  const depositPercent = options.depositPercent ?? 0;
  assertNonNeg(taxPercent, 'taxPercent');
  assertNonNeg(depositPercent, 'depositPercent');
  if (taxPercent > 100) throw new QuoteCalcError('taxPercent must be ≤ 100');
  if (depositPercent > 100) throw new QuoteCalcError('depositPercent must be ≤ 100');

  const input = lineItems || [];
  const strict: QuoteLineItem[] =
    input.length === 0
      ? []
      : input.every(isStrictLine)
        ? (input as QuoteLineItem[])
        : normalizeLineItems(input as LooseLineInput[]);

  const lineTotalsCents = strict.map(lineTotalCents);
  const subtotalCents = lineTotalsCents.reduce((a, b) => a + b, 0);
  const taxCents = percentOfCents(subtotalCents, taxPercent);
  const totalCents = subtotalCents + taxCents;
  const depositCents = percentOfCents(totalCents, depositPercent);

  return { subtotalCents, taxCents, totalCents, depositCents, lineTotalsCents };
}
