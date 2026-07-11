/**
 * Pure reporting aggregations — unit-tested, no DB.
 */

export type QuoteRow = {
  status: string;
  jobType: string | null;
  totalCents: number;
  createdAt: Date;
  acceptedAt: Date | null;
  sentAt: Date | null;
};

export type InvoiceRow = {
  status: string;
  totalCents: number;
  amountDueCents: number;
  amountPaidCents: number;
  depositCents: number;
  createdAt: Date;
  dueAt: Date | null;
};

export type PaymentRow = {
  amountCents: number;
  method: string;
  status: string;
  createdAt: Date;
};

export function sumByStatus(quotes: QuoteRow[]): Record<string, { count: number; totalCents: number }> {
  const out: Record<string, { count: number; totalCents: number }> = {};
  for (const q of quotes) {
    const s = q.status || 'unknown';
    if (!out[s]) out[s] = { count: 0, totalCents: 0 };
    out[s].count += 1;
    out[s].totalCents += q.totalCents;
  }
  return out;
}

export function sumByJobType(quotes: QuoteRow[]): { jobType: string; count: number; totalCents: number }[] {
  const map = new Map<string, { count: number; totalCents: number }>();
  for (const q of quotes) {
    const key = q.jobType || 'unspecified';
    const cur = map.get(key) || { count: 0, totalCents: 0 };
    cur.count += 1;
    cur.totalCents += q.totalCents;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([jobType, v]) => ({ jobType, ...v }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

export function conversionRates(quotes: QuoteRow[]): {
  total: number;
  sent: number;
  viewed: number;
  accepted: number;
  declined: number;
  sentToAcceptedPct: number | null;
  viewedToAcceptedPct: number | null;
} {
  const total = quotes.length;
  const sent = quotes.filter((q) =>
    ['sent', 'viewed', 'accepted', 'declined', 'invoiced', 'paid'].includes(q.status),
  ).length;
  const viewed = quotes.filter((q) =>
    ['viewed', 'accepted', 'declined', 'invoiced', 'paid'].includes(q.status),
  ).length;
  const accepted = quotes.filter((q) =>
    ['accepted', 'invoiced', 'paid'].includes(q.status),
  ).length;
  const declined = quotes.filter((q) => q.status === 'declined').length;
  return {
    total,
    sent,
    viewed,
    accepted,
    declined,
    sentToAcceptedPct: sent > 0 ? Math.round((accepted / sent) * 1000) / 10 : null,
    viewedToAcceptedPct: viewed > 0 ? Math.round((accepted / viewed) * 1000) / 10 : null,
  };
}

/** AR buckets by days past due (or since invoice created if no dueAt). */
export function arAging(
  invoices: InvoiceRow[],
  now = new Date(),
): {
  currentCents: number;
  d1_30Cents: number;
  d31_60Cents: number;
  d61_90Cents: number;
  d90PlusCents: number;
  totalDueCents: number;
} {
  let currentCents = 0;
  let d1_30Cents = 0;
  let d31_60Cents = 0;
  let d61_90Cents = 0;
  let d90PlusCents = 0;

  for (const inv of invoices) {
    if (inv.status === 'void' || inv.status === 'paid') continue;
    const due = Math.max(0, inv.amountDueCents);
    if (due <= 0) continue;
    const anchor = inv.dueAt || inv.createdAt;
    const days = Math.floor((now.getTime() - anchor.getTime()) / 86_400_000);
    if (days <= 0) currentCents += due;
    else if (days <= 30) d1_30Cents += due;
    else if (days <= 60) d31_60Cents += due;
    else if (days <= 90) d61_90Cents += due;
    else d90PlusCents += due;
  }

  return {
    currentCents,
    d1_30Cents,
    d31_60Cents,
    d61_90Cents,
    d90PlusCents,
    totalDueCents: currentCents + d1_30Cents + d31_60Cents + d61_90Cents + d90PlusCents,
  };
}

export function paymentsByMethod(
  payments: PaymentRow[],
): { method: string; count: number; totalCents: number }[] {
  const map = new Map<string, { count: number; totalCents: number }>();
  for (const p of payments) {
    if (p.status !== 'succeeded') continue;
    const key = p.method || 'other';
    const cur = map.get(key) || { count: 0, totalCents: 0 };
    cur.count += 1;
    cur.totalCents += p.amountCents;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.totalCents - a.totalCents);
}

/** Last N calendar months of collected payments + accepted quote totals. */
export function monthlySeries(
  payments: PaymentRow[],
  quotes: QuoteRow[],
  months = 6,
  now = new Date(),
): {
  key: string; // YYYY-MM
  label: string;
  collectedCents: number;
  acceptedCents: number;
  invoiceCount: number;
}[] {
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const collected = new Map(keys.map((k) => [k, 0]));
  const accepted = new Map(keys.map((k) => [k, 0]));
  const invCount = new Map(keys.map((k) => [k, 0]));

  for (const p of payments) {
    if (p.status !== 'succeeded') continue;
    const k = `${p.createdAt.getUTCFullYear()}-${String(p.createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
    if (collected.has(k)) collected.set(k, (collected.get(k) || 0) + p.amountCents);
  }
  for (const q of quotes) {
    const when = q.acceptedAt || (['accepted', 'invoiced', 'paid'].includes(q.status) ? q.createdAt : null);
    if (!when) continue;
    const k = `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, '0')}`;
    if (accepted.has(k)) {
      accepted.set(k, (accepted.get(k) || 0) + q.totalCents);
      invCount.set(k, (invCount.get(k) || 0) + 1);
    }
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return keys.map((key) => {
    const [y, m] = key.split('-').map(Number);
    return {
      key,
      label: `${monthNames[(m || 1) - 1]} ${y}`,
      collectedCents: collected.get(key) || 0,
      acceptedCents: accepted.get(key) || 0,
      invoiceCount: invCount.get(key) || 0,
    };
  });
}
