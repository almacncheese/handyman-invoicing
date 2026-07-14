import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { resolveBilling } from '@/lib/billing';
import { prisma } from '@/lib/db';
import { AppShell } from '@/components/AppShell';
import { SettingsForm } from '@/components/SettingsForm';
import { PaymentGatewaySettings } from '@/components/PaymentGatewaySettings';
import { TeamManager } from '@/components/TeamManager';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import Link from 'next/link';

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
        readOnly={session.role !== 'owner'}
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
        <PaymentGatewaySettings readOnly={session.role !== 'owner'} />
      </div>

      <div className="mt-10">
        <div className="page-header !mb-4">
          <div>
            <p className="page-kicker">Account</p>
            <h2 className="page-title">Security</h2>
            <p className="page-sub">
              Signed in as <strong className="font-medium text-[var(--ink)]">{session.email}</strong>
              {session.platformAdmin ? (
                <>
                  {' '}
                  ·{' '}
                  <Link href="/admin" className="text-[var(--pine)] underline underline-offset-2">
                    Platform admin
                  </Link>
                </>
              ) : null}
              {' · '}
              <Link href="/billing" className="text-[var(--pine)] underline underline-offset-2">
                Plan &amp; trial
              </Link>
            </p>
          </div>
        </div>
        <ChangePasswordForm />
      </div>

      <div className="mt-10">
        <div className="page-header !mb-4">
          <div>
            <p className="page-kicker">People</p>
            <h2 className="page-title">Team</h2>
          </div>
        </div>
        <TeamManager canInvite={session.role === 'owner'} />
      </div>
    </AppShell>
  );
}
