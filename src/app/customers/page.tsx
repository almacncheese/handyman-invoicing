import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { resolveBilling } from '@/lib/billing';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/AppShell';
import { CustomerForm } from '@/components/CustomerForm';

export default async function CustomersPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [business, customers] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: session.businessId } }),
    prisma.customer.findMany({
      where: { businessId: session.businessId },
      orderBy: { name: 'asc' },
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
          <p className="page-kicker">CRM</p>
          <h1 className="page-title">Customers</h1>
          <p className="page-sub">People you estimate and invoice for.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <CustomerForm />
        <div>
          <div className="mb-2.5 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-tight">Directory</h2>
            <span className="text-xs font-medium text-[var(--muted)]">{customers.length}</span>
          </div>
          {customers.length === 0 ? (
            <div className="empty-board">
              <p className="font-semibold text-[var(--ink)]">No customers yet</p>
              <p className="mt-1 text-sm">Add your first contact on the left.</p>
            </div>
          ) : (
            <div className="ledger">
              {customers.map((c) => (
                <Link key={c.id} href={`/customers/${c.id}`} className="ledger-row !grid-cols-1">
                  <div className="min-w-0">
                    <div className="ledger-title">{c.name}</div>
                    <div className="ledger-meta">
                      {[c.phone, c.email].filter(Boolean).join(' · ') || 'No contact info'}
                      {c.address ? ` · ${c.address}` : ''}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
