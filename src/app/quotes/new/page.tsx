import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/AppShell';
import { QuoteBuilder } from '@/components/QuoteBuilder';

type Props = { searchParams: Promise<{ customerId?: string }> };

export default async function NewQuotePage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;

  const [business, customers] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: session.businessId } }),
    prisma.customer.findMany({
      where: { businessId: session.businessId },
      orderBy: { name: 'asc' },
    }),
  ]);

  const preselect =
    sp.customerId && customers.some((c) => c.id === sp.customerId) ? sp.customerId : '';

  return (
    <AppShell businessName={business.name}>
      <div className="page-header">
        <div>
          <p className="page-kicker">Create</p>
          <h1 className="page-title">New estimate</h1>
          <p className="page-sub">Price the job, add photos, then save and send.</p>
        </div>
      </div>
      <QuoteBuilder
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        defaults={{
          taxPercent: business.defaultTaxPct,
          depositPercent: business.defaultDeposit,
          margin: business.defaultMargin,
          laborRate: business.defaultLaborRate,
        }}
        initial={
          preselect
            ? {
                title: 'Estimate',
                jobType: 'general',
                customerId: preselect,
                jobAddress: '',
                notes: '',
                taxPercent: business.defaultTaxPct,
                depositPercent: business.defaultDeposit,
                lines: [],
              }
            : undefined
        }
      />
    </AppShell>
  );
}
