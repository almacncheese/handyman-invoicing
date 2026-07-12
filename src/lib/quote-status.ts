/**
 * Quote lifecycle — forward-only transitions.
 */

export const QUOTE_STATUSES = [
  'draft',
  'sent',
  'viewed',
  'accepted',
  'declined',
  'invoiced',
  'paid',
  'void',
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

const ORDER: Record<string, number> = {
  draft: 0,
  sent: 1,
  viewed: 2,
  accepted: 3,
  declined: 3,
  invoiced: 4,
  paid: 5,
  void: 99,
};

/** Can we move from `from` to `to`? */
export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  if (from === to) return true;
  if (from === 'void' || from === 'paid') return false;
  if (to === 'void') return true;
  if (from === 'declined') return false;
  if (to === 'declined') {
    return from === 'sent' || from === 'viewed' || from === 'draft';
  }
  if (to === 'accepted') {
    return from === 'sent' || from === 'viewed' || from === 'draft';
  }
  return (ORDER[to] ?? 0) > (ORDER[from] ?? 0);
}

export function assertTransition(from: QuoteStatus, to: QuoteStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid quote transition ${from} → ${to}`);
  }
}

/** Statuses from which a customer may still decline (pre-accept). */
export const DECLINABLE_STATUSES = ['draft', 'sent', 'viewed'] as const;

/**
 * Prisma `where` for a race-safe decline — mirrors accept's conditional write.
 * Must reject rows that already have a signature or terminal status.
 */
export function declineWriteGuard(quoteId: string) {
  return {
    id: quoteId,
    acceptedAt: null as Date | null,
    signatureData: null as string | null,
    status: { in: [...DECLINABLE_STATUSES] },
  };
}

/**
 * May this quote become an invoice?
 * Status is the source of truth — never promote via acceptedAt alone
 * (that resurrected voided quotes in convert).
 */
export function canConvertToInvoice(status: QuoteStatus): boolean {
  return status === 'accepted';
}

export const JOB_TYPES = [
  { value: 'general', label: 'General handyman' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'deck', label: 'Deck / outdoor' },
  { value: 'paint', label: 'Paint / finish' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'flooring', label: 'Flooring' },
  { value: 'other', label: 'Other' },
] as const;
