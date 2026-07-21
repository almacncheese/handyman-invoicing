import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/AppShell';
import { formatUsd } from '@/lib/money';
import { resolveBilling } from '@/lib/billing';
import { InvoiceActions } from '@/components/InvoiceActions';
import type { QuoteLineItem } from '@/lib/calculations';
import { lineTotalCents } from '@/lib/calculations';

type Props = { params: Promise<{ id: string }> };

export default async function InvoiceDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;

  const [business, invoice] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: session.businessId } }),
    prisma.invoice.findUnique({
      where: { id },
      include: {
        quote: { include: { customer: true } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    }),
  ]);

  if (!invoice || invoice.businessId !== session.businessId) notFound();
  const lines = invoice.lineItems as QuoteLineItem[];

  const savedMethods = invoice.quote.customerId
    ? await prisma.savedPaymentMethod.findMany({
        where: { businessId: session.businessId, customerId: invoice.quote.customerId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, brand: true, last4: true, provider: true },
      })
    : [];

  const billing = resolveBilling(business);

  return (
    <AppShell
      businessName={business.name}
      planLabel={billing.label}
      trialExpired={billing.isExpired}
      trialDaysLeft={billing.isTrial ? billing.trialDaysLeft : undefined}
    >
      <Link href="/invoices" className="back-link">
        ← Invoices
      </Link>
      <div className="page-header">
        <div>
          <p className="page-kicker capitalize">{invoice.status}</p>
          <h1 className="page-title">{invoice.number}</h1>
          <p className="page-sub">
            From{' '}
            <Link href={`/quotes/${invoice.quoteId}`} className="link-accent">
              {invoice.quote.title}
            </Link>
            {invoice.quote.customer ? ` · ${invoice.quote.customer.name}` : ''}
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="panel overflow-hidden lg:col-span-2">
          <table className="hq-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="!text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td>
                    <div className="font-medium">{line.description || line.type}</div>
                    <div className="text-xs capitalize text-[var(--muted)]">{line.type}</div>
                  </td>
                  <td className="money !text-right font-medium">
                    {formatUsd(lineTotalCents(line))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="totals-soft">
            <div className="row">
              <span>Subtotal</span>
              <span>{formatUsd(invoice.subtotalCents)}</span>
            </div>
            <div className="row">
              <span>Tax</span>
              <span>{formatUsd(invoice.taxCents)}</span>
            </div>
            <div className="row total">
              <span>Total</span>
              <span>{formatUsd(invoice.totalCents)}</span>
            </div>
            <div className="row deposit">
              <span>Deposit target</span>
              <span>{formatUsd(invoice.depositCents)}</span>
            </div>
            <div className="row">
              <span>Paid</span>
              <span>{formatUsd(invoice.amountPaidCents)}</span>
            </div>
            <div className="row total">
              <span>Balance due</span>
              <span>{formatUsd(invoice.amountDueCents)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
        <InvoiceActions
          invoiceId={invoice.id}
          status={invoice.status}
          recurring={invoice.recurring}
          recurInterval={invoice.recurInterval}
          recurNextAt={invoice.recurNextAt ? invoice.recurNextAt.toISOString() : null}
          lastReminderAt={invoice.lastReminderAt ? invoice.lastReminderAt.toISOString() : null}
          reminderCount={invoice.reminderCount}
          customerEmail={invoice.quote.customer?.email ?? null}
          autoCharge={invoice.autoCharge}
          savedMethodId={invoice.savedMethodId}
          savedMethods={savedMethods}
        />
        <div className="panel h-fit">
          <div className="panel-head">
            <div>
              <h2 className="panel-title">Payment history</h2>
              <p className="panel-sub">Manual records only in this build</p>
            </div>
          </div>
          <div className="panel-body">
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No payments recorded yet.</p>
            ) : (
              <ul className="space-y-2.5 text-sm">
                {invoice.payments.map((p) => (
                  <li key={p.id} className="border-b border-[var(--hairline)] pb-2.5 last:border-0">
                    <div className="font-semibold capitalize">
                      {p.method} · {formatUsd(p.amountCents)}
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      {p.status} · {new Date(p.createdAt).toLocaleString()}
                    </div>
                    {p.note && <div className="mt-0.5 text-xs text-[var(--ink-2)]">{p.note}</div>}
                  </li>
                ))}
              </ul>
            )}
            <Link href={`/quotes/${invoice.quoteId}`} className="btn btn-secondary mt-4 w-full">
              Back to estimate
            </Link>
          </div>
        </div>
        </div>
      </div>
    </AppShell>
  );
}
