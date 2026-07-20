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
              Start 14-day trial
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <p className="mkt-section-label">Pricing</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
          One simple plan.
        </h1>
        <p className="mt-3 max-w-xl text-lg text-[var(--muted)]">
          Full product for 14 days. Then Pro — no free-forever tier.
        </p>

        <div className="mt-10 mx-auto max-w-md">
          <div className="card relative overflow-hidden border-[var(--pine)] p-6 shadow-[var(--shadow)] ring-1 ring-[var(--pine)]">
            <div className="absolute right-4 top-4 rounded-full bg-[var(--pine-soft)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--pine-deep)]">
              Most popular
            </div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--pine)]">
              Pro
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-4xl font-semibold tracking-tight text-[var(--ink)]">$29</span>
              <span className="text-sm font-medium text-[var(--muted)]">/mo</span>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Includes a <strong className="font-semibold text-[var(--ink-2)]">14-day free trial</strong>.
              After trial, Pro is required to keep sending estimates.
            </p>
            <ul className="mt-6 space-y-2.5 text-[0.9375rem] text-[var(--ink-2)]">
              <li className="flex gap-2">
                <span className="font-bold text-[var(--pine)]">✓</span> Unlimited estimates & invoices
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[var(--pine)]">✓</span> Customer e-signature links
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[var(--pine)]">✓</span> Price list, photos, branding
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[var(--pine)]">✓</span> Staff seats for your team
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[var(--pine)]">✓</span> Manual payment tracking
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-[var(--pine)]">✓</span> Priority support
              </li>
            </ul>
            <Link href="/signup" className="btn btn-primary mt-7 w-full">
              Start 14-day free trial
            </Link>
            <p className="mt-3 text-center text-xs text-[var(--muted)]">
              No free forever plan · Cancel anytime after you subscribe
            </p>
          </div>
        </div>

        <div className="mt-10 rounded-lg border border-[var(--line)] bg-white px-5 py-4 text-sm text-[var(--muted)]">
          <p className="font-medium text-[var(--ink)]">How trial works</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Day 1–14: full Pro features while you set up and send real estimates.</li>
            <li>Day 15+: subscribe to Pro at $29/mo to keep the workspace live.</li>
            <li>Card billing is being wired next — trial accounts are time-limited, not free forever.</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
