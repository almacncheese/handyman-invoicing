/**
 * Build offline payment affordances (Zelle / Cash App / Venmo).
 * Pure — tested. Empty handles omit buttons.
 */

export type PaymentHandles = {
  zelleHandle?: string | null;
  cashappCashtag?: string | null;
  venmoHandle?: string | null;
};

export type PaymentLink = {
  kind: 'zelle' | 'cashapp' | 'venmo';
  label: string;
  href: string | null;
  display: string;
};

function stripCashTag(s: string) {
  return s.replace(/^\$/, '').trim();
}

function stripAt(s: string) {
  return s.replace(/^@/, '').trim();
}

export function buildPaymentLinks(
  handles: PaymentHandles,
  amountCents?: number,
): PaymentLink[] {
  const links: PaymentLink[] = [];
  const dollars =
    amountCents != null && amountCents > 0
      ? (amountCents / 100).toFixed(2)
      : undefined;

  if (handles.zelleHandle?.trim()) {
    const display = handles.zelleHandle.trim();
    links.push({
      kind: 'zelle',
      label: 'Zelle',
      href: null, // Zelle is bank-app based
      display,
    });
  }

  if (handles.cashappCashtag?.trim()) {
    const tag = stripCashTag(handles.cashappCashtag);
    const href = dollars
      ? `https://cash.app/$${encodeURIComponent(tag)}/${dollars}`
      : `https://cash.app/$${encodeURIComponent(tag)}`;
    links.push({
      kind: 'cashapp',
      label: 'Cash App',
      href,
      display: `$${tag}`,
    });
  }

  if (handles.venmoHandle?.trim()) {
    const user = stripAt(handles.venmoHandle);
    const href = dollars
      ? `https://venmo.com/${encodeURIComponent(user)}?txn=pay&amount=${dollars}`
      : `https://venmo.com/${encodeURIComponent(user)}`;
    links.push({
      kind: 'venmo',
      label: 'Venmo',
      href,
      display: `@${user}`,
    });
  }

  return links;
}
