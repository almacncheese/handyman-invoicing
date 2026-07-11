import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/AppShell';
import { StatusBadge } from '@/components/StatusBadge';
import { CustomerEditForm } from '@/components/CustomerEditForm';
import { formatUsd } from '@/lib/money';
import { resolveBilling } from '@/lib/billing';

type Props = { params: Promise<{ id: string }> };

export default async function CustomerDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { id } = await params;

  const [business, customer] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: session.businessId } }),
    prisma.customer.findUnique({
      where: { id },
      include: {
        quotes: { orderBy: { updatedAt: 'desc' }, take: 50 },
      },
    }),
  ]);

  if (!customer || customer.businessId !== session.businessId) notFound();

  const won = customer.quotes.filter((q) =>
    ['accepted', 'invoiced', 'paid'].includes(q.status),
  );
  const pipeline = customer.quotes
    .filter((q) => ['draft', 'sent', 'viewed', 'accepted'].includes(q.status))
    .reduce((s, q) => s + q.totalCents, 0);

  const billing = resolveBilling(business);

  return (
    <AppShell
      businessName={business.name}
      planLabel={billing.label}
      trialExpired={billing.isExpired}
      trialDaysLeft={billing.isTrial ? billing.trialDaysLeft : undefined}
    >
      <div className="mb-4">
        <Link href="/customers" className="text-sm font-medium text-[var(--accent)]">
          ← Customers
        </Link>
        <h1 className="page-title mt-2">{customer.name}</h1>
        <p className="page-sub">
          {[customer.phone, customer.email, customer.address].filter(Boolean).join(' · ') ||
            'No contact details yet'}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="metric">
          <div className="metric-label">Estimates</div>
          <div className="metric-value">{customer.quotes.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Won / signed</div>
          <div className="metric-value">{won.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Open pipeline</div>
          <div className="metric-value">{formatUsd(pipeline)}</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CustomerEditForm
          customer={{
            id: customer.id,
            name: customer.name,
            email: customer.email || '',
            phone: customer.phone || '',
            address: customer.address || '',
            notes: customer.notes || '',
          }}
        />

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Estimates</h2>
            <Link
              href={`/quotes/new?customerId=${customer.id}`}
              className="btn btn-primary !py-1.5 !text-xs"
            >
              New for this customer
            </Link>
          </div>
          {customer.quotes.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No estimates yet.</p>
          ) : (
            <ul className="space-y-2">
              {customer.quotes.map((q) => (
                <li key={q.id}>
                  <Link href={`/quotes/${q.id}`} className="row-ticket">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {q.number && (
                          <span className="font-mono text-xs text-[var(--muted)]">{q.number}</span>
                        )}
                        <span className="truncate font-semibold">{q.title}</span>
                        <StatusBadge status={q.status} />
                      </div>
                    </div>
                    <div className="money font-semibold">{formatUsd(q.totalCents)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
