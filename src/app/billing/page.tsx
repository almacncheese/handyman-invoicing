import Link from 'next/link';
import { requireWorkspace } from '@/lib/workspace';
import { AppShell } from '@/components/AppShell';
import { BillingActions } from '@/components/BillingActions';
import { PRO_PRICE_USD } from '@/lib/billing';
import { formatUsd } from '@/lib/money';

type Props = { searchParams: Promise<{ checkout?: string }> };

export default async function BillingPage({ searchParams }: Props) {
  const { business, billing, user } = await requireWorkspace();
  const price = formatUsd(billing.monthlyPriceCents);
  const sp = await searchParams;
  const justCheckedOut = sp.checkout === 'success';
  const isOwner = user.role === 'owner';

  return (
    <AppShell
      businessName={business.name}
      planLabel={billing.label}
      trialExpired={billing.isExpired}
      trialDaysLeft={billing.isTrial ? billing.trialDaysLeft : undefined}
    >
      <div className="page-header">
        <div>
          <p className="page-kicker">Account</p>
          <h1 className="page-title">Plan &amp; trial</h1>
          <p className="page-sub">Manage your Ledgerly Pro subscription.</p>
        </div>
      </div>

      <div className="card max-w-lg p-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Current status
        </div>
        <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{billing.label}</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Pro list price for this workspace:{' '}
          <strong className="text-[var(--ink)]">{price}/mo</strong>
          {billing.priceOverridden ? ' (custom)' : ` (standard $${PRO_PRICE_USD})`}.
        </p>

        {billing.isExpired && (
          <div className="mt-4 rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-3 text-sm">
            Your free trial has ended. Sending new estimates is paused until Pro is active.
          </div>
        )}

        {billing.isTrial && (
          <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-3 text-sm text-[var(--ink-2)]">
            You have <strong>{billing.trialDaysLeft} day{billing.trialDaysLeft === 1 ? '' : 's'}</strong>{' '}
            left on trial. After that, Pro at {price}/mo is required to keep sending estimates.
          </div>
        )}

        {billing.isPro && (
          <div className="mt-4 rounded-md border border-[var(--pine)] bg-[var(--pine-soft)] px-3 py-3 text-sm text-[var(--pine-deep)]">
            Pro is active for this workspace. Full product access.
          </div>
        )}

        {justCheckedOut && !billing.isPro && (
          <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-3 text-sm text-[var(--ink-2)]">
            Finishing up your upgrade — this can take a few seconds. Refresh if this doesn&apos;t
            update shortly.
          </div>
        )}

        {isOwner ? (
          !billing.isPro && billing.priceOverridden ? (
            <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-3 text-sm text-[var(--ink-2)]">
              This workspace has custom pricing set by your platform admin. Contact{' '}
              <a className="font-semibold underline" href="mailto:owner@smithwebco.com">
                owner@smithwebco.com
              </a>{' '}
              to activate Pro.
            </div>
          ) : (
            <BillingActions action={billing.isPro ? 'portal' : 'checkout'} />
          )
        ) : (
          !billing.isPro && (
            <p className="mt-4 text-sm text-[var(--muted)]">
              Ask the business owner to upgrade to Pro.
            </p>
          )
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/dashboard" className="btn btn-secondary">
            Back to estimates
          </Link>
          <Link href="/pricing" className="btn btn-ghost">
            Public pricing
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
