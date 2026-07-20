'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandLogo } from './BrandLogo';
import { AccountMenu } from './AccountMenu';
import {
  IconCatalog,
  IconChart,
  IconGear,
  IconInvoices,
  IconPeople,
  IconQuotes,
} from './Icons';

const nav = [
  { href: '/dashboard', label: 'Estimates', icon: IconQuotes },
  { href: '/invoices', label: 'Invoices', icon: IconInvoices },
  { href: '/customers', label: 'Customers', icon: IconPeople },
  { href: '/catalog', label: 'Price list', icon: IconCatalog },
  { href: '/reports', label: 'Reports', icon: IconChart },
  { href: '/settings', label: 'Settings', icon: IconGear },
];

export function AppShell({
  businessName,
  planLabel,
  trialExpired,
  trialDaysLeft,
  children,
}: {
  businessName: string;
  /** e.g. "Trial · 12d left" or "Pro" */
  planLabel?: string;
  trialExpired?: boolean;
  trialDaysLeft?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  function active(href: string) {
    if (href === '/dashboard') {
      return pathname === '/dashboard' || pathname.startsWith('/quotes');
    }
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <div className="hq-shell hq-shell-v4">
      <header className="hq-appbar">
        <div className="hq-appbar-inner">
          <div className="hq-appbar-brand">
            <BrandLogo href="/dashboard" inverted size={30} />
          </div>

          <nav className="hq-appbar-nav" aria-label="Main">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="hq-appbar-link"
                  data-active={active(item.href)}
                  data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Icon />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="hq-appbar-right">
            {planLabel && (
              <Link
                href="/billing"
                className="hidden shrink-0 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold uppercase tracking-wide min-[1180px]:inline-block"
                style={{
                  background: trialExpired ? 'var(--warn-soft)' : 'var(--pine-soft)',
                  color: trialExpired ? 'var(--warn)' : 'var(--pine-deep)',
                }}
                title="Plan & trial"
              >
                {planLabel}
              </Link>
            )}
            <div className="hq-workspace hidden min-[1440px]:flex">
              <span className="hq-workspace-label">Workspace</span>
              <span className="hq-workspace-name">{businessName}</span>
            </div>
            <Link href="/quotes/new" className="btn btn-primary btn-sm hq-appbar-cta" data-testid="new-estimate-btn">
              New estimate
            </Link>
            <AccountMenu inverted />
          </div>
        </div>
      </header>

      {trialExpired && (
        <div className="border-b border-[var(--warn)] bg-[var(--warn-soft)] px-4 py-2.5 text-center text-sm text-[var(--ink)]">
          Your free trial has ended. Subscribe to <strong>Pro ($29/mo)</strong> to keep sending
          estimates.{' '}
          <Link href="/billing" className="font-semibold underline underline-offset-2">
            Plan details
          </Link>
        </div>
      )}
      {!trialExpired && trialDaysLeft != null && trialDaysLeft <= 5 && trialDaysLeft > 0 && (
        <div className="border-b border-[var(--line)] bg-[var(--pine-soft)] px-4 py-2 text-center text-sm text-[var(--pine-deep)]">
          Trial: <strong>
            {trialDaysLeft} day{trialDaysLeft === 1 ? '' : 's'}
          </strong>{' '}
          left · then Pro at $29/mo ·{' '}
          <Link href="/billing" className="font-semibold underline underline-offset-2">
            Details
          </Link>
        </div>
      )}

      <main className="hq-main">
        <div className="hq-content">{children}</div>
      </main>

      <nav className="hq-dock" aria-label="Mobile navigation">
        <Link href="/dashboard" data-active={active('/dashboard')}>
          <IconQuotes />
          Estimates
        </Link>
        <Link href="/invoices" data-active={active('/invoices')}>
          <IconInvoices />
          Invoices
        </Link>
        <Link href="/quotes/new" className="hq-dock-cta" aria-label="New estimate">
          <span className="fab">+</span>
        </Link>
        <Link href="/customers" data-active={active('/customers')}>
          <IconPeople />
          Customers
        </Link>
        <Link href="/settings" data-active={active('/settings')}>
          <IconGear />
          Settings
        </Link>
      </nav>
    </div>
  );
}
