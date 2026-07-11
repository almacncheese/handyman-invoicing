import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { resolveBilling } from '@/lib/billing';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/AppShell';
import { SettingsForm } from '@/components/SettingsForm';
import { TeamManager } from '@/components/TeamManager';

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const business = await prisma.business.findUniqueOrThrow({
    where: { id: session.businessId },
  });

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
          <p className="page-kicker">Workspace</p>
          <h1 className="page-title">Business settings</h1>
          <p className="page-sub">
            Branding, tax defaults, and payment handles on customer estimates.
          </p>
        </div>
      </div>
      <SettingsForm
        initial={{
          name: business.name,
          primaryColor: business.primaryColor,
          logoUrl: business.logoUrl || '',
          phone: business.phone || '',
          email: business.email || '',
          address: business.address || '',
          website: business.website || '',
          defaultTaxPct: business.defaultTaxPct,
          defaultDeposit: business.defaultDeposit,
          defaultLaborRate: business.defaultLaborRate,
          defaultMargin: business.defaultMargin,
          quotePrefix: business.quotePrefix,
          termsText: business.termsText || '',
          zelleHandle: business.zelleHandle || '',
          cashappCashtag: business.cashappCashtag || '',
          venmoHandle: business.venmoHandle || '',
        }}
      />
      <div className="mt-10">
        <div className="page-header !mb-4">
          <div>
            <p className="page-kicker">People</p>
            <h2 className="page-title">Team</h2>
          </div>
        </div>
        <TeamManager />
      </div>
    </AppShell>
  );
}
