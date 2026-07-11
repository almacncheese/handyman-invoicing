import Link from 'next/link';
import { BrandLogo } from '@/components/BrandLogo';

export default function PricingPage() {
  return (
    <main className="min-h-dvh bg-[var(--canvas)]">
      <header className="bg-[var(--graphite)] text-white">
        <div className="mkt-nav">
          <BrandLogo href="/" inverted size={30} />
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="btn btn-secondary !border-white/25 !bg-transparent !text-white hover:!bg-white/10"
            >
              Sign in
            </Link>
            <Link href="/signup" className="btn btn-primary">
              Start free
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <p className="mkt-section-label">Pricing</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
          Simple plans. Ship work first.
        </h1>
        <p className="mt-3 max-w-xl text-lg text-[var(--muted)]">
          Use the full product while you set up your process. Pay when you host in production.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="card p-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Trial
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight text-[var(--ink)]">$0</span>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">Everything you need to run jobs locally.</p>
            <ul className="mt-6 space-y-2.5 text-[0.9375rem] text-[var(--ink-2)]">
              <li className="flex gap-2">
                <span className="text-[var(--pine)] font-bold">✓</span> Unlimited estimates
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--pine)] font-bold">✓</span> E-signature & public links
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--pine)] font-bold">✓</span> Photos & price list
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--pine)] font-bold">✓</span> Manual payment tracking
              </li>
            </ul>
            <Link href="/signup" className="btn btn-secondary mt-7 w-full">
              Create workspace
            </Link>
          </div>

          <div className="card relative overflow-hidden border-[var(--pine)] p-6 shadow-[var(--shadow)] ring-1 ring-[var(--pine)]">
            <div className="absolute right-4 top-4 rounded-full bg-[var(--pine-soft)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--pine-deep)]">
              Production
            </div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--pine)]">
              Pro
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight text-[var(--ink)]">$29</span>
              <span className="text-sm font-medium text-[var(--muted)]">/mo</span>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">When you are live with customers.</p>
            <ul className="mt-6 space-y-2.5 text-[0.9375rem] text-[var(--ink-2)]">
              <li className="flex gap-2">
                <span className="text-[var(--pine)] font-bold">✓</span> Everything in Trial
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--pine)] font-bold">✓</span> Production hosting
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--pine)] font-bold">✓</span> Full branding
              </li>
              <li className="flex gap-2">
                <span className="text-[var(--pine)] font-bold">✓</span> Priority support
              </li>
            </ul>
            <Link href="/signup" className="btn btn-primary mt-7 w-full">
              Start free — upgrade later
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
