'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatUsd } from '@/lib/money';

export function QuoteActions({
  quoteId,
  status,
  hasInvoice,
  depositCents,
  invoiceId,
  amountPaidCents = 0,
  shareUrlInitial,
}: {
  quoteId: string;
  status: string;
  hasInvoice: boolean;
  depositCents: number;
  invoiceId?: string | null;
  amountPaidCents?: number;
  shareUrlInitial?: string | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(shareUrlInitial || null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function ensureInvoiceId(): Promise<string> {
    if (invoiceId) return invoiceId;
    const conv = await fetch(`/api/quotes/${quoteId}/convert`, { method: 'POST' });
    const data = await conv.json();
    if (!conv.ok) throw new Error(data.error || 'Could not create invoice');
    if (!data.invoice?.id) throw new Error('Invoice missing in response');
    return data.invoice.id as string;
  }

  async function send() {
    await run(async () => {
      const res = await fetch(`/api/quotes/${quoteId}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send failed');
      setShareUrl(data.shareUrl);
      try {
        await navigator.clipboard.writeText(data.shareUrl);
        setMsg('Customer link copied');
      } catch {
        setMsg('Customer link ready — copy below');
      }
      router.refresh();
    });
  }

  async function convert() {
    await run(async () => {
      const res = await fetch(`/api/quotes/${quoteId}/convert`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Convert failed');
      setMsg(
        data.already
          ? `Invoice ${data.invoice.number} already exists`
          : `Invoice ${data.invoice.number} created`,
      );
      router.refresh();
    });
  }

  async function recordOffline(method: 'cash' | 'check' | 'zelle' | 'cashapp' | 'venmo' | 'other') {
    await run(async () => {
      const invId = await ensureInvoiceId();
      const remaining = Math.max(0, depositCents - amountPaidCents) || depositCents;
      if (remaining <= 0) throw new Error('Deposit already fully recorded');
      const res = await fetch('/api/payments/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invId,
          amountCents: remaining,
          method,
          note: `Recorded ${method}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Record failed');
      setMsg(`Recorded ${method}: ${formatUsd(remaining)}`);
      router.refresh();
    });
  }

  async function duplicate() {
    await run(async () => {
      const res = await fetch(`/api/quotes/${quoteId}/duplicate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Duplicate failed');
      router.push(`/quotes/${data.quote.id}`);
      router.refresh();
    });
  }

  async function voidQuote() {
    if (!confirm('Void this estimate?')) return;
    await run(async () => {
      const res = await fetch(`/api/quotes/${quoteId}/void`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Void failed');
      setMsg('Estimate voided');
      router.refresh();
    });
  }

  const depositLeft = Math.max(0, depositCents - amountPaidCents);
  const showConvert = status === 'accepted' && !hasInvoice;
  const canRecord =
    depositLeft > 0 &&
    status !== 'void' &&
    status !== 'declined' &&
    (hasInvoice || status === 'accepted' || status === 'invoiced');

  return (
    <div className="panel">
      <div className="panel-head">
        <h2 className="panel-title">Actions</h2>
      </div>
      <div className="panel-body space-y-4">
        <div className="flex flex-wrap gap-2">
          {status !== 'void' && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={send}>
              {status === 'draft' ? 'Send to customer' : 'Copy share link'}
            </button>
          )}
          {showConvert && (
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={convert}>
              Convert to invoice
            </button>
          )}
        </div>

        {canRecord && (
          <div className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)] p-3">
            <p className="section-label !mb-1">Record deposit · {formatUsd(depositLeft)}</p>
            <p className="text-xs leading-relaxed text-[var(--muted)]">
              Card payments are off. Log cash, check, or Zelle when you receive them.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {(['cash', 'check', 'zelle', 'cashapp', 'venmo'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy}
                  onClick={() => recordOffline(m)}
                >
                  {m === 'cashapp' ? 'Cash App' : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 border-t border-[var(--hairline)] pt-3">
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={duplicate}>
            Duplicate
          </button>
          {status !== 'void' && status !== 'paid' && (
            <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={voidQuote}>
              Void
            </button>
          )}
          {shareUrl && (
            <a className="btn btn-ghost btn-sm" href={`${shareUrl}/print`} target="_blank" rel="noreferrer">
              Print / PDF
            </a>
          )}
        </div>

        {shareUrl && (
          <div className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[#fafbfc] p-3 text-sm">
            <div className="section-label !mb-1">Customer link</div>
            <a
              className="break-all font-medium text-[var(--pine)]"
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
            >
              {shareUrl}
            </a>
            <div className="mt-2.5 flex flex-wrap gap-3 text-xs font-semibold">
              <button
                type="button"
                className="btn-link"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl);
                    setMsg('Link copied');
                  } catch {
                    setMsg('Copy the link above manually');
                  }
                }}
              >
                Copy again
              </button>
              <a
                className="link-accent"
                href={`sms:?&body=${encodeURIComponent(`Your estimate: ${shareUrl}`)}`}
              >
                Text
              </a>
              <a
                className="link-accent"
                href={`mailto:?subject=${encodeURIComponent('Your estimate')}&body=${encodeURIComponent(`Please review and sign your estimate:\n\n${shareUrl}`)}`}
              >
                Email
              </a>
            </div>
          </div>
        )}

        {msg && (
          <p className="alert alert-success" role="status">
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
