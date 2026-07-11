'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandLogo } from './BrandLogo';
import { LogoutButton } from './LogoutButton';
import {
  IconCatalog,
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
  { href: '/settings', label: 'Settings', icon: IconGear },
];

export function AppShell({
  businessName,
  children,
}: {
  businessName: string;
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
      {/* Full-width top app bar — replaces the old dark left rail */}
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
                >
                  <Icon />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="hq-appbar-right">
            <div className="hq-workspace">
              <span className="hq-workspace-label">Workspace</span>
              <span className="hq-workspace-name">{businessName}</span>
            </div>
            <Link href="/quotes/new" className="btn btn-primary btn-sm hq-appbar-cta">
              New estimate
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

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
