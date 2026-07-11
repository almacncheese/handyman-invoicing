import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { QuoteActions } from '@/components/QuoteActions';
import { formatUsd } from '@/lib/money';
import { resolveBilling } from '@/lib/billing';
import type { QuoteLineItem } from '@/lib/calculations';
import { lineTotalCents } from '@/lib/calculations';
import { normalizePhotos } from '@/lib/photos';
import { appUrl } from '@/lib/config';

type Props = { params: Promise<{ id: string }> };

export default async function QuoteDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;

  const [quote, activities] = await Promise.all([
    prisma.quote.findUnique({
      where: { id },
      include: {
        customer: true,
        invoice: { include: { payments: true } },
        business: true,
      },
    }),
    prisma.activity.findMany({
      where: { businessId: session.businessId, quoteId: id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ]);
  if (!quote || quote.businessId !== session.businessId) notFound();

  const lines = quote.lineItems as QuoteLineItem[];
  const photos = normalizePhotos(quote.photos);
  const shareUrl = quote.publicToken ? `${appUrl()}/e/${quote.publicToken}` : null;
  const amountPaid = quote.invoice?.amountPaidCents || 0;

  const billing = resolveBilling(quote.business);

  return (
    <AppShell
      businessName={quote.business.name}
      planLabel={billing.label}
      trialExpired={billing.isExpired}
      trialDaysLeft={billing.isTrial ? billing.trialDaysLeft : undefined}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            {quote.number && (
              <span className="font-mono text-xs font-medium tracking-wide text-[var(--muted)]">
                {quote.number}
              </span>
            )}
            <StatusBadge status={quote.status} />
          </div>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--ink)]">
            {quote.title}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {quote.customer ? (
              <Link
                href={`/customers/${quote.customer.id}`}
                className="font-medium text-[var(--pine)] hover:underline"
              >
                {quote.customer.name}
              </Link>
            ) : (
              'No customer'
            )}
            {quote.jobAddress ? ` · ${quote.jobAddress}` : ''}
            {quote.jobType ? ` · ${quote.jobType}` : ''}
            {quote.validUntil
              ? ` · valid until ${new Date(quote.validUntil).toLocaleDateString()}`
              : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['draft', 'sent', 'viewed'].includes(quote.status) && (
            <Link href={`/quotes/${quote.id}/edit`} className="btn btn-secondary">
              Edit
            </Link>
          )}
          {shareUrl && (
            <a href={`${shareUrl}/print`} className="btn btn-secondary" target="_blank" rel="noreferrer">
              Print
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={p.dataUrl}
                  alt=""
                  className="aspect-square w-full border border-[var(--border)] object-cover"
                />
              ))}
            </div>
          )}

          <div className="panel overflow-hidden">
            <table className="hq-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Type</th>
                  <th className="!text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td>
                      {line.description || <span className="text-[var(--muted)]">Untitled</span>}
                    </td>
                    <td className="capitalize text-[var(--muted)]">{line.type}</td>
                    <td className="money !text-right font-semibold">
                      {formatUsd(lineTotalCents(line))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="totals-soft">
              <div className="row">
                <span>Subtotal</span>
                <span>{formatUsd(quote.subtotalCents)}</span>
              </div>
              <div className="row">
                <span>Tax ({quote.taxPercent}%)</span>
                <span>{formatUsd(quote.taxCents)}</span>
              </div>
              <div className="row total">
                <span>Total</span>
                <span>{formatUsd(quote.totalCents)}</span>
              </div>
              <div className="row deposit">
                <span>Deposit ({quote.depositPercent}%)</span>
                <span>{formatUsd(quote.depositCents)}</span>
              </div>
              {amountPaid > 0 && (
                <div className="row">
                  <span>Paid</span>
                  <span>{formatUsd(amountPaid)}</span>
                </div>
              )}
            </div>
          </div>

          {quote.notes && (
            <div className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Notes</h2>
              </div>
              <div className="panel-body text-sm whitespace-pre-wrap text-[var(--ink-2)]">
                {quote.notes}
              </div>
            </div>
          )}

          {quote.signedName && (
            <div className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Signature</h2>
              </div>
              <div className="panel-body text-sm">
                <p className="font-medium text-[var(--success)]">
                  Signed by {quote.signedName}
                  {quote.acceptedAt
                    ? ` · ${new Date(quote.acceptedAt).toLocaleString()}`
                    : ''}
                </p>
              </div>
            </div>
          )}

          {quote.internalNotes && (
            <div className="panel border-[var(--warn)]">
              <div className="panel-head !bg-[var(--warn-soft)]">
                <h2 className="panel-title">Internal notes</h2>
              </div>
              <div className="panel-body text-sm whitespace-pre-wrap">{quote.internalNotes}</div>
            </div>
          )}

          {quote.declineReason && (
            <div className="panel">
              <div className="panel-head">
                <h2 className="panel-title text-[var(--danger)]">Decline reason</h2>
              </div>
              <div className="panel-body text-sm">{quote.declineReason}</div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <QuoteActions
            quoteId={quote.id}
            status={quote.status}
            hasInvoice={Boolean(quote.invoice)}
            depositCents={quote.depositCents}
            invoiceId={quote.invoice?.id}
            amountPaidCents={amountPaid}
            shareUrlInitial={shareUrl}
          />
          {quote.invoice && (
            <div className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Invoice {quote.invoice.number}</h2>
              </div>
              <div className="panel-body text-sm">
                <p className="capitalize text-[var(--muted)]">Status: {quote.invoice.status}</p>
                <p className="mt-1 font-mono font-medium">
                  Paid {formatUsd(quote.invoice.amountPaidCents)} /{' '}
                  {formatUsd(quote.invoice.totalCents)}
                </p>
                {quote.invoice.payments.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-[var(--hairline)] pt-2 text-xs text-[var(--muted)]">
                    {quote.invoice.payments.map((p) => (
                      <li key={p.id}>
                        {p.status} · {p.method || p.provider} · {formatUsd(p.amountCents)}
                      </li>
                    ))}
                  </ul>
                )}
                <Link href={`/invoices/${quote.invoice.id}`} className="link-accent mt-3 inline-block text-sm">
                  Open invoice →
                </Link>
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Timeline</h2>
            </div>
            <div className="panel-body">
              {activities.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">No activity yet.</p>
              ) : (
                <div>
                  {activities.map((a) => (
                    <div key={a.id} className="activity-item text-sm">
                      <p className="font-medium text-[var(--ink)]">{a.message}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {a.actorName || a.actorType} · {new Date(a.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
