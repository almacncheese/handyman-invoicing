import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { formatUsd } from '@/lib/money';
import { resolveBilling } from '@/lib/billing';

export default async function InvoicesPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [business, invoices] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: session.businessId } }),
    prisma.invoice.findMany({
      where: { businessId: session.businessId },
      orderBy: { createdAt: 'desc' },
      include: { quote: { include: { customer: true } }, payments: true },
      take: 100,
    }),
  ]);

  const billing = resolveBilling(business);

  return (
    <AppShell
      businessName={business.name}
      planLabel={billing.label}
      trialExpired={billing.isExpired}
      trialDaysLeft={billing.isTrial ? billing.trialDaysLeft : undefined}
    >
      <div className="page-header">
        <div>
          <p className="page-kicker">Billing</p>
          <h1 className="page-title">Invoices</h1>
          <p className="page-sub">Deposits and balances across accepted work.</p>
        </div>
      </div>

      {invoices.length === 0 ? (
        <div className="empty-board">
          <p className="font-semibold text-[var(--ink)]">No invoices yet</p>
          <p className="mt-1 text-sm">
            Accept an estimate, then convert it or record a deposit from the estimate page.
          </p>
          <Link href="/dashboard" className="btn btn-primary mt-4">
            Go to estimates
          </Link>
        </div>
      ) : (
        <div className="ledger">
          <div className="ledger-head !grid-cols-[6.5rem_1fr_7rem_5.5rem]">
            <span>Number</span>
            <span>Job</span>
            <span className="text-right">Balance</span>
            <span className="text-right">Status</span>
          </div>
          {invoices.map((inv) => {
            const balance = Math.max(0, inv.amountDueCents);
            return (
              <Link key={inv.id} href={`/invoices/${inv.id}`} className="ledger-row">
                <span className="ledger-num">{inv.number}</span>
                <div className="min-w-0">
                  <div className="ledger-title truncate">{inv.quote.title}</div>
                  <div className="ledger-meta truncate">
                    {inv.quote.customer?.name || 'No customer'} · paid{' '}
                    {formatUsd(inv.amountPaidCents)} of {formatUsd(inv.totalCents)}
                  </div>
                </div>
                <div className="ledger-amount">{formatUsd(balance)}</div>
                <div className="ledger-status">
                  <StatusBadge status={inv.status} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
