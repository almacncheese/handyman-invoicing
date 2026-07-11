import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/AppShell';
import { CatalogManager } from '@/components/CatalogManager';
import { formatUsd } from '@/lib/money';
import { resolveBilling } from '@/lib/billing';

export default async function CatalogPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [business, templates] = await Promise.all([
    prisma.business.findUniqueOrThrow({ where: { id: session.businessId } }),
    prisma.lineTemplate.findMany({
      where: { businessId: session.businessId },
      orderBy: { description: 'asc' },
    }),
  ]);

  const serialized = templates.map((t) => ({
    id: t.id,
    type: t.type,
    description: t.description,
    costCents: t.costCents,
    marginPercent: t.marginPercent,
    hours: t.hours,
    rateCents: t.rateCents,
    amountCents: t.amountCents,
    qty: t.qty,
    label:
      t.type === 'material'
        ? `${t.description} · cost ${formatUsd(t.costCents || 0)} + ${t.marginPercent ?? 0}%`
        : t.type === 'labor'
          ? `${t.description} · ${t.hours ?? 1}h @ ${formatUsd(t.rateCents || 0)}/hr`
          : `${t.description} · ${formatUsd(t.amountCents || 0)}`,
  }));

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
          <p className="page-kicker">Pricing</p>
          <h1 className="page-title">Price list</h1>
          <p className="page-sub">
            Saved materials, labor, and fees you reuse on every estimate.
          </p>
        </div>
      </div>
      <CatalogManager
        initial={serialized}
        defaults={{
          margin: business.defaultMargin,
          laborRate: business.defaultLaborRate,
        }}
      />
    </AppShell>
  );
}
