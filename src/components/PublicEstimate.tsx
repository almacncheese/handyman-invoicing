'use client';

import { useRef, useState } from 'react';
import { formatUsd } from '@/lib/money';
import type { PaymentLink } from '@/lib/payment-links';

type Estimate = {
  title: string;
  number?: string | null;
  status: string;
  jobType?: string | null;
  lineItems: Array<{
    type: string;
    description?: string;
    costCents?: number;
    marginPercent?: number;
    hours?: number;
    rateCents?: number;
    amountCents?: number;
    qty?: number;
  }>;
  photos?: Array<{ id: string; dataUrl: string; caption?: string }>;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
  taxPercent: number;
  depositPercent: number;
  notes?: string | null;
  termsText?: string | null;
  jobAddress?: string | null;
  validUntil?: string | null;
  acceptedAt?: string | null;
  signedName?: string | null;
  hasSignature: boolean;
  declined?: boolean;
  paymentLinks?: PaymentLink[];
  customer: { name: string } | null;
  business: {
    name: string;
    primaryColor: string;
    logoUrl?: string | null;
    phone?: string | null;
    email?: string | null;
  };
};

function lineAmount(line: Estimate['lineItems'][0]): number {
  if (line.type === 'material' && line.costCents != null) {
    const sell =
      line.costCents + Math.round((line.costCents * (line.marginPercent || 0)) / 100);
    return Math.round(sell * (line.qty ?? 1));
  }
  if (line.type === 'labor') {
    return Math.round((line.hours || 0) * (line.rateCents || 0));
  }
  return Math.round((line.amountCents || 0) * (line.qty ?? 1));
}

export function PublicEstimate({
  token,
  initial,
}: {
  token: string;
  initial: Estimate;
}) {
  const [estimate, setEstimate] = useState(initial);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const locked =
    Boolean(estimate.acceptedAt || estimate.hasSignature) ||
    estimate.status === 'declined' ||
    estimate.declined;

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * canvas.width,
      y: ((e.clientY - r.top) / r.height) * canvas.height,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (locked) return;
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || locked) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1c1f24';
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function onPointerUp() {
    drawing.current = false;
  }

  function clearSig() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function accept() {
    setError(null);
    if (!name.trim()) {
      setError('Enter your full legal name');
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    if (canvas.toDataURL() === blank.toDataURL()) {
      setError('Please sign above');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/public/estimate/${token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedName: name.trim(),
          signatureData: canvas.toDataURL('image/png'),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not accept');
        return;
      }
      setEstimate((e) => ({
        ...e,
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
        signedName: name.trim(),
        hasSignature: true,
      }));
    } catch {
      setError('Network error — try again');
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/estimate/${token}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: declineReason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not decline');
        return;
      }
      setEstimate((e) => ({ ...e, status: 'declined', declined: true }));
      setDeclineOpen(false);
    } catch {
      setError('Network error — try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="public-sheet">
      <header className="public-header">
        <div className="relative z-10 mx-auto max-w-lg">
          <p className="text-sm font-semibold tracking-wide text-white/70">
            {estimate.business.name}
          </p>
          {estimate.number && (
            <p className="mt-1 font-mono text-xs font-medium text-white/55">{estimate.number}</p>
          )}
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-[1.75rem]">
            {estimate.title}
          </h1>
          {estimate.customer && (
            <p className="mt-2 text-[0.9375rem] text-white/80">
              Prepared for {estimate.customer.name}
            </p>
          )}
          {estimate.jobAddress && (
            <p className="text-[0.9375rem] text-white/70">{estimate.jobAddress}</p>
          )}
          {estimate.validUntil && (
            <p className="mt-2 text-sm text-white/60">
              Valid until {new Date(estimate.validUntil).toLocaleDateString()}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-5 pb-16">
        {estimate.photos && estimate.photos.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {estimate.photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={p.id}
                src={p.dataUrl}
                alt={p.caption || 'Job photo'}
                className="aspect-[4/3] w-full rounded-md border border-[var(--border)] object-cover"
              />
            ))}
          </div>
        )}

        <div className="panel overflow-hidden">
          <table className="hq-table">
            <thead>
              <tr>
                <th>Description</th>
                <th className="!text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {estimate.lineItems.map((line, i) => (
                <tr key={i}>
                  <td>
                    <div className="font-medium">{line.description || line.type}</div>
                    <div className="text-xs capitalize text-[var(--muted)]">{line.type}</div>
                  </td>
                  <td className="money !text-right font-medium">{formatUsd(lineAmount(line))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals-soft">
            <div className="row">
              <span>Subtotal</span>
              <span>{formatUsd(estimate.subtotalCents)}</span>
            </div>
            <div className="row">
              <span>Tax ({estimate.taxPercent}%)</span>
              <span>{formatUsd(estimate.taxCents)}</span>
            </div>
            <div className="row total">
              <span>Total</span>
              <span>{formatUsd(estimate.totalCents)}</span>
            </div>
            {estimate.depositCents > 0 && (
              <div className="row deposit">
                <span>Suggested deposit ({estimate.depositPercent}%)</span>
                <span>{formatUsd(estimate.depositCents)}</span>
              </div>
            )}
          </div>
        </div>

        {estimate.notes && (
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Notes</h2>
            </div>
            <div className="panel-body text-sm whitespace-pre-wrap text-[var(--ink-2)]">
              {estimate.notes}
            </div>
          </div>
        )}

        {estimate.termsText && (
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Terms</h2>
            </div>
            <div className="panel-body text-xs leading-relaxed whitespace-pre-wrap text-[var(--muted)]">
              {estimate.termsText}
            </div>
          </div>
        )}

        <div className="panel">
          <div className="panel-body space-y-3">
            {estimate.status === 'declined' || estimate.declined ? (
              <div>
                <p className="font-semibold text-[var(--ink)]">Estimate declined</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Contact {estimate.business.name} if you change your mind.
                </p>
              </div>
            ) : locked ? (
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-[var(--success)]">Estimate accepted</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Signed by {estimate.signedName}
                    {estimate.acceptedAt
                      ? ` on ${new Date(estimate.acceptedAt).toLocaleString()}`
                      : ''}
                  </p>
                </div>
                <div className="rounded-[var(--radius-sm)] bg-[var(--pine-soft)] px-3 py-3 text-sm">
                  <p className="font-semibold text-[var(--pine-deep)]">What happens next</p>
                  <p className="mt-1 text-[var(--ink-2)]">
                    {estimate.business.name} will contact you to schedule the work
                    {estimate.depositCents > 0
                      ? ` and arrange the ${formatUsd(estimate.depositCents)} deposit`
                      : ''}
                    .
                  </p>
                  {estimate.business.phone && (
                    <p className="mt-2">
                      Phone:{' '}
                      <a className="link-accent" href={`tel:${estimate.business.phone}`}>
                        {estimate.business.phone}
                      </a>
                    </p>
                  )}
                </div>
                {estimate.paymentLinks && estimate.paymentLinks.length > 0 && (
                  <div className="space-y-2 border-t border-[var(--hairline)] pt-3">
                    <div className="section-label">Payment options</div>
                    {estimate.paymentLinks.map((l) =>
                      l.href ? (
                        <a
                          key={l.kind}
                          href={l.href}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-secondary w-full"
                        >
                          {l.label}: {l.display}
                        </a>
                      ) : (
                        <div
                          key={l.kind}
                          className="rounded-[var(--radius-sm)] border border-[var(--line)] px-3 py-2 text-sm"
                        >
                          <span className="font-medium">{l.label}:</span> {l.display}
                        </div>
                      ),
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                <h2 className="text-base font-semibold tracking-tight">Accept this estimate</h2>
                <div className="field">
                  <label>Full legal name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-semibold text-[var(--ink-2)]">Signature</span>
                    <button type="button" className="btn-link" onClick={clearSig}>
                      Clear
                    </button>
                  </div>
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={180}
                    className="sig-pad"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  />
                </div>
                {error && (
                  <p className="alert alert-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-primary w-full"
                  disabled={busy}
                  onClick={accept}
                >
                  {busy ? 'Submitting…' : 'Accept & sign'}
                </button>
                {!declineOpen ? (
                  <button
                    type="button"
                    className="btn btn-ghost w-full"
                    disabled={busy}
                    onClick={() => setDeclineOpen(true)}
                  >
                    Decline estimate
                  </button>
                ) : (
                  <div className="space-y-2 rounded-[var(--radius-sm)] border border-[var(--line)] p-3">
                    <div className="field">
                      <label>Reason (optional)</label>
                      <textarea
                        rows={2}
                        value={declineReason}
                        onChange={(e) => setDeclineReason(e.target.value)}
                        placeholder="Timing, budget, etc."
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-danger flex-1"
                        disabled={busy}
                        onClick={decline}
                      >
                        Confirm decline
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary flex-1"
                        disabled={busy}
                        onClick={() => setDeclineOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex justify-center gap-4 text-xs text-[var(--muted)]">
          <a href={`/e/${token}/print`} className="underline">
            Print / PDF
          </a>
          {estimate.business.phone && <span>{estimate.business.phone}</span>}
        </div>
        <p className="text-center text-xs text-[var(--steel-dim)]">Powered by HandyQuote</p>
      </main>
    </div>
  );
}
